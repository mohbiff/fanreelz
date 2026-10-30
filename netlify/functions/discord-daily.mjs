// "AI video of the day" for Discord. Server admins type /daily in a channel, optionally picking a world (a game, series, movie,
// anime or cartoon) and/or a character; every day at 16:00 UTC (17:00/18:00 in Sweden) the bot posts one popular AI fan film
// that fits. /today shows today's pick to anyone, with the same choices.
// The channels and today's picks live in import_state (key "discord_daily"), which only the server can read or change.
// Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DISCORD_BOT_TOKEN.
import CATS from "./lib/catmap.mjs";

const SITE = "https://fanreelz.com";
const KEY = "discord_daily";
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n || 0));
const env = (k) => Netlify.env.get(k);
const head = () => ({ apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"), "Content-Type": "application/json" });
const catName = (id) => CATS.find((c) => c.id === id)?.name || id;
// a short, safe text for a character name ("Arthas", "Goku")
export const cleanChar = (t) => String(t || "").replace(/[^\p{L}\p{N} '.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
// what a channel asked for: everything, one world, one character, or a character within a world
// t.creators: YouTube channel names joined by "|" ("Ya Boi Tyler|SoraVerse"); their videos are mixed together
const creatorsOf = (t) => String(t?.creators || "").split("|").filter(Boolean);
export const topicKey = (t) => `${t?.cat || "*"}|${(t?.char || "").toLowerCase() || "*"}` + (creatorsOf(t).length ? "|" + creatorsOf(t).map((x) => x.toLowerCase()).sort().join("+") : "");
// t.cat can hold several worlds ("cs,aoe2"): each day one of them is picked at random
const cats = (t) => String(t?.cat || "").split(",").filter(Boolean);
export const topicName = (t) => [t?.char, cats(t).map(catName).join(" / "), creatorsOf(t).length ? "by " + creatorsOf(t).join(" + ") : ""].filter(Boolean).join(" · ") || "all AI fan films";

export async function loadState() {
  const r = await fetch(env("SUPABASE_URL") + `/rest/v1/import_state?key=eq.${KEY}&select=value`, { headers: head() });
  if (!r.ok) throw new Error("db " + r.status);
  const v = ((await r.json())[0] || {}).value || {};
  return { channels: v.channels || {}, sent: v.sent && !Array.isArray(v.sent) ? v.sent : {}, today: v.today?.picks ? v.today : null, follows: v.follows || {} };
}
export async function saveState(s) {
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/import_state", { method: "POST", headers: { ...head(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify([{ key: KEY, value: s }]) });
  if (!r.ok) throw new Error("db save " + r.status);
}

// today's film for a topic: one of the most watched that fits (not shown for that topic in a long while), the more views the likelier.
// Every channel with the same topic gets the same film all day.
export async function todaysPick(s, topic = {}) {
  const date = new Date().toISOString().slice(0, 10), k = topicKey(topic);
  if (s.today?.date !== date) s.today = { date, picks: {} };
  if (s.today.picks[k]) return s.today.picks[k];
  let q = "catalog?select=id,title,views,video_id,channel,cat,char,duration,format&hidden=eq.false&age_restricted=eq.false&platform=eq.YouTube&order=views.desc&limit=400";
  // several worlds: today's world is one of them at random (one with films about the chosen character, if there is a character)
  const list = cats(topic).sort(() => Math.random() - 0.5);
  if (list.length) q += "&cat=in.(" + list.map(encodeURIComponent).join(",") + ")";
  if (topic.char) { const c = encodeURIComponent(`*${topic.char}*`); q += `&or=(char.ilike.${c},title.ilike.${c})`; }
  // chosen creators: only their videos, all of them mixed together
  const who = creatorsOf(topic);
  if (who.length) q += "&channel=in.(" + who.map((x) => encodeURIComponent('"' + x.replace(/"/g, "") + '"')).join(",") + ")";
  // the whole catalogue: only properly popular films; a world or character: whatever there is
  if (!topic.cat && !topic.char && !who.length) q += "&views=gte.20000";
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + q, { headers: head() });
  if (!r.ok) throw new Error("db " + r.status);
  // under 30 minutes, so talks and podcasts that mention AI don't get picked
  let all = (await r.json()).filter((f) => !f.duration || f.duration <= 1800);
  if (list.length > 1) { const world = list.find((c) => all.some((f) => f.cat === c)); all = all.filter((f) => f.cat === world); }
  if (!all.length) return null;
  const seen = new Set(s.sent[k] || []);
  let pool = all.filter((f) => !seen.has(f.id));
  if (!pool.length) { s.sent[k] = []; pool = all; }
  const w = pool.map((f) => Math.sqrt(f.views || 1)), total = w.reduce((a, b) => a + b, 0);
  let x = Math.random() * total, film = pool[0];
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { film = pool[i]; break; } }
  s.today.picks[k] = film;
  // remember what was shown, so a topic doesn't repeat until most of its films have had a turn
  s.sent[k] = [...(s.sent[k] || []), film.id].slice(-Math.min(120, Math.max(1, all.length - 1)));
  // keep the stored state small: forget topics nobody has asked for in a while
  const keys = Object.keys(s.sent); if (keys.length > 300) for (const old of keys.slice(0, keys.length - 300)) delete s.sent[old];
  return film;
}

// a card whose title, picture and button all open the film on Fanreelz (not YouTube), so people watch and rate it there
export const filmLink = (f) => `${SITE}/${f.format === "short" ? "shorts" : "film"}/${encodeURIComponent(f.id)}`;
export const dailyMessage = (f, topic = {}) => ({
  content: topic.label || `🎬 **AI video of the day**${topic.cat || topic.char || topic.creators ? ` · ${topicName(topic)}` : ""}`,
  embeds: [{
    color: 0xffd23f, title: f.title.slice(0, 250), url: filmLink(f),
    description: [f.channel ? `by ${f.channel}` : "", f.views ? `${fmt(f.views)} views` : "", f.cat ? catName(f.cat) : ""].filter(Boolean).join(" · ") + `\n\n▶️ **[Watch and rate it on Fanreelz](${filmLink(f)})**`,
    image: f.video_id ? { url: `https://i.ytimg.com/vi/${f.video_id}/hqdefault.jpg` } : undefined,
    footer: { text: "Fanreelz · the home of AI fan films" },
  }],
  components: [{ type: 1, components: [{ type: 2, style: 5, label: "Watch on Fanreelz", url: filmLink(f) }] }],
  allowed_mentions: { parse: [] },
});

// links in Discord messages say which server they were posted in, so Fanreelz's statistics can show "via Discord: <server>"
export const tagLinks = (text, guild) => String(text).replace(/https:\/\/fanreelz\.com(\/[^\s"<>)\]\\]*)?/g, (u) => u + (u.includes("?") ? "&" : "?") + "via=discord" + (guild ? "&s=" + guild : ""));
export async function postTo(channel, f, topic, guild) {
  const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: "POST", headers: { Authorization: "Bot " + env("DISCORD_BOT_TOKEN"), "Content-Type": "application/json" }, body: tagLinks(JSON.stringify(dailyMessage(f, topic)), guild) });
  return { ok: r.ok, status: r.status };
}

// the daily run (cron "0 16 * * *"): post today's film in every channel that asked for it; channels the bot can no longer reach are dropped.
// A server can have several channels, each with its own topic (key: "server:channel").
export default async () => {
  const s = await loadState();
  const ids = Object.keys(s.channels);
  if (!ids.length) return new Response("no channels");
  let sent = 0;
  for (const id of ids) {
    const c = s.channels[id], f = await todaysPick(s, c);
    if (!f) continue;
    const res = await postTo(c.channel, f, c, id.split(":")[0]);
    if (res.ok) sent++;
    else if ([403, 404].includes(res.status)) delete s.channels[id];
  }
  await saveState(s);
  return new Response(`posted in ${sent} of ${ids.length} channels`);
};
export const config = { schedule: "0 16 * * *" };

// creators Fanreelz has, for typing in /daily and /today: names that contain what was typed, most watched first
export async function findCreators(text, limit = 25) {
  const t = String(text || "").replace(/[*,()"]/g, " ").trim().slice(0, 60);
  let q = "catalog?select=channel,views&hidden=eq.false&order=views.desc&limit=1000";
  if (t) q += "&channel=ilike." + encodeURIComponent(`*${t}*`);
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + q, { headers: head() });
  if (!r.ok) return [];
  const seen = new Map();
  for (const x of await r.json()) if (x.channel && !seen.has(x.channel)) seen.set(x.channel, 1);
  return [...seen.keys()].slice(0, limit);
}

// /follow: a channel gets each NEW video from chosen creators as soon as Fanreelz has it, optionally only when the title
// has one of the chosen words ("warcraft, roblox"). Checked every 10 minutes; keys are "server:channel".
export const followName = (f) => `${f.creators.split("|").join(" + ")}${f.words ? ` · only with "${f.words.split("|").join('", "')}"` : ""}`;
export async function runFollows() {
  const s = await loadState(), ids = Object.keys(s.follows);
  if (!ids.length) return new Response("no follows");
  const now = new Date().toISOString();
  // everything Fanreelz added since the oldest check, from all followed creators at once
  const since = ids.map((k) => s.follows[k].last || s.follows[k].at).sort()[0];
  const who = [...new Set(ids.flatMap((k) => s.follows[k].creators.split("|")))];
  const q = `catalog?select=id,title,views,video_id,channel,cat,char,duration,format,added_at,published_at&hidden=eq.false&age_restricted=eq.false&added_at=gt.${encodeURIComponent(since)}` +
    "&channel=in.(" + who.map((x) => encodeURIComponent('"' + x.replace(/"/g, "") + '"')).join(",") + ")&order=added_at.asc&limit=100";
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + q, { headers: head() });
  if (!r.ok) return new Response("db " + r.status);
  // only videos that are new on YouTube too (not an old video Fanreelz found late)
  const rows = (await r.json()).filter((f) => !f.published_at || Date.now() - Date.parse(f.published_at) < 4 * 864e5);
  let sent = 0;
  for (const k of ids) {
    const fo = s.follows[k], from = fo.last || fo.at, names = fo.creators.split("|").map((x) => x.toLowerCase()), words = (fo.words || "").split("|").filter(Boolean).map((w) => w.toLowerCase());
    const mine = rows.filter((f) => f.added_at > from && names.includes(String(f.channel).toLowerCase()) && (!words.length || words.some((w) => (f.title + " " + (f.char || "") + " " + catName(f.cat)).toLowerCase().includes(w)))).slice(0, 5);
    for (const f of mine) {
      if (sent >= 25) break; // Cloudflare allows a limited number of calls per run; the rest go out next time
      const res = await postTo(fo.channel, f, { label: `🆕 **New video from ${f.channel}**` }, k.split(":")[0]);
      if (res.ok) { sent++; fo.last = f.added_at; }
      else if ([403, 404].includes(res.status)) { delete s.follows[k]; break; }
    }
    if (s.follows[k] && !mine.length) fo.last = now;
  }
  await saveState(s);
  return new Response(`follows: posted ${sent}`);
}
