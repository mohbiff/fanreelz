// Fanreelz bot for Discord. Discord sends each slash command here (Interactions Endpoint URL = https://fanreelz.com/api/discord),
// so no always-on server is needed. Commands: /top, /random, /search, /showdown, /today, /daily, /fanreelz.
// Needs in Netlify: DISCORD_PUBLIC_KEY (from the Discord app's General Information page), SUPABASE_URL, SUPABASE_ANON_KEY.
import CATS from "./lib/catmap.mjs";
import { loadState, saveState, todaysPick, dailyMessage, postTo, cleanChar, topicName, tagLinks, findCreators, followName } from "./discord-daily.mjs";

const SITE = "https://fanreelz.com";
const COLOR = 0xffd23f;
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n || 0));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const reply = (data) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...data } });
const CHOOSABLE = CATS.filter((c) => !["aiseries"].includes(c.id));

// Discord signs every request; checked with Web Crypto (works on both Netlify and Cloudflare)
const hex = (h) => new Uint8Array((String(h).match(/../g) || []).map((x) => parseInt(x, 16)));
async function verify(body, sig, ts) {
  try {
    const key = await crypto.subtle.importKey("raw", hex(Netlify.env.get("DISCORD_PUBLIC_KEY") || ""), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + body));
  } catch { return false; }
}

async function sb(path) {
  const key = Netlify.env.get("SUPABASE_ANON_KEY");
  const r = await fetch(Netlify.env.get("SUPABASE_URL") + "/rest/v1/" + path, { headers: { apikey: key, Authorization: "Bearer " + key } });
  if (!r.ok) throw new Error("db " + r.status);
  return r.json();
}
const findCat = (t) => { t = String(t || "").trim().toLowerCase(); return t ? CATS.find((c) => c.id === t || c.name.toLowerCase() === t) || CATS.find((c) => c.name.toLowerCase().includes(t)) || null : null; };
const filmUrl = (r) => `${SITE}/film/${encodeURIComponent(r.id)}`;
const line = (r, i) => `**${i + 1}.** [${r.title.replace(/[[\]]/g, "")}](${filmUrl(r)})${r.views ? ` · ${fmt(r.views)} views` : ""}`;
const opt = (i, name) => (i.data.options || []).find((o) => o.name === name)?.value;

async function top(i) {
  const c = findCat(opt(i, "category"));
  if (opt(i, "category") && !c) return reply({ content: `I don't know the category "${opt(i, "category")}". Start typing and pick one from the list.`, flags: 64 });
  const rows = await sb(`catalog?select=id,title,views,cat&hidden=eq.false&age_restricted=eq.false${c ? "&cat=eq." + c.id : ""}&order=views.desc&limit=5`);
  if (!rows.length) return reply({ content: `No films in ${c ? c.name : "the catalogue"} yet.`, flags: 64 });
  return reply({ embeds: [{ color: COLOR, title: `Top 5 AI fan films${c ? ": " + c.name : ""}`, url: c ? `${SITE}/c/${c.id}` : SITE, description: rows.map(line).join("\n"), footer: { text: "Fanreelz · the home of AI fan films" } }] });
}
async function random(i) {
  const c = findCat(opt(i, "category"));
  const rows = await sb(`catalog?select=id,title,views,video_id,channel,cat,format&hidden=eq.false&age_restricted=eq.false${c ? "&cat=eq." + c.id : ""}&order=views.desc&limit=200`);
  if (!rows.length) return reply({ content: "No films found.", flags: 64 });
  const r = rows[Math.floor(Math.random() * rows.length)];
  // the same Fanreelz card as the daily video: everything opens the film on Fanreelz
  const m = dailyMessage({ ...r, format: r.format }, {});
  m.content = "🎲 **Random AI fan film**";
  return reply(m);
}
async function search(i) {
  const q = String(opt(i, "query") || "").replace(/[%*,()]/g, " ").trim().slice(0, 60);
  if (!q) return reply({ content: "Type something to search for.", flags: 64 });
  const rows = await sb(`catalog?select=id,title,views&hidden=eq.false&age_restricted=eq.false&title=ilike.*${encodeURIComponent(q)}*&order=views.desc&limit=5`);
  if (!rows.length) return reply({ content: `Nothing found for "${q}". Try fewer words.`, flags: 64 });
  return reply({ embeds: [{ color: COLOR, title: `AI fan films for "${q}"`, url: `${SITE}/search?q=${encodeURIComponent(q)}`, description: rows.map(line).join("\n") }] });
}
async function showdown() {
  const v = await sb("showdown_verdicts?select=key,data,updated_at&order=updated_at.desc&limit=50");
  const open = v.filter((r) => r.data?.status === "open");
  const withVerdict = open.filter((r) => r.data?.verdict).sort((a, b) => (b.data.verdict.total || 0) - (a.data.verdict.total || 0));
  const r = withVerdict[0] || open[Math.floor(Math.random() * open.length)];
  if (!r) return reply({ content: `Who would win? Vote at ${SITE}/showdown` });
  const d = r.data, url = `${SITE}/showdown/${encodeURIComponent(r.key)}`;
  const bar = d.verdict ? `\n**${d.a} ${d.verdict.pa}%** vs **${d.verdict.pb}% ${d.b}**\n${d.verdict.summary || ""}` : "\nNo verdict yet: it goes live after 10 votes.";
  return reply({ embeds: [{ color: COLOR, title: `⚔️ ${d.a} vs ${d.b}`, url, description: `Who wins? Vote and tell everyone why.${bar}`, footer: { text: "Fanreelz Character Showdown" } }] });
}
// /today and /daily take the same choices: nothing (all AI fan films), a world (game, series, movie, anime, cartoon…) and/or a character
async function topicOf(i) {
  const ids = [];
  for (const n of ["category", "category2", "category3"]) {
    const raw = opt(i, n); if (!raw) continue;
    const c = findCat(raw);
    if (!c) return { error: `I don't know "${raw}". Start typing and pick a game, series, movie, anime or cartoon from the list.` };
    if (!ids.includes(c.id)) ids.push(c.id);
  }
  // creators: one per option, or several separated by commas; matched to the names Fanreelz has (any spelling of upper/lower case)
  const wanted = ["creator", "creator2", "creator3"].flatMap((n) => String(opt(i, n) || "").split(",")).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const creators = [];
  for (const w of wanted) {
    const hits = await findCreators(w, 50).catch(() => []);
    const hit = hits.find((h) => h.toLowerCase() === w.toLowerCase()) || hits[0];
    if (!hit) return { error: `I can't find the creator "${w}" on Fanreelz. Start typing and pick a name from the list.` };
    if (!creators.includes(hit)) creators.push(hit);
  }
  return { cat: ids.sort().join(","), char: cleanChar(opt(i, "character")), creators: creators.join("|") };
}
// /today: today's AI video for anyone
async function today(i) {
  const t = await topicOf(i); if (t.error) return reply({ content: t.error, flags: 64 });
  const s = await loadState(), f = await todaysPick(s, t);
  if (!f) return reply({ content: `No AI fan films found for ${topicName(t)} yet. Try another name.`, flags: 64 });
  await saveState(s);
  return reply(dailyMessage(f, t));
}
// /follow: a server admin gets every new video from one or more creators posted here, optionally only with certain words
async function follow(i) {
  if (!i.guild_id) return reply({ content: "Use /follow in a server channel.", flags: 64 });
  const perms = BigInt(i.member?.permissions || "0");
  if (!(perms & 0x20n) && !(perms & 0x8n)) return reply({ content: "Only people who can manage this server can choose what the bot posts.", flags: 64 });
  const s = await loadState(), id = i.guild_id + ":" + i.channel_id;
  if (opt(i, "mode") === "off") {
    const had = !!s.follows[id]; delete s.follows[id]; await saveState(s);
    return reply({ content: had ? "New videos are no longer posted in this channel." : "Nothing was being followed in this channel.", flags: 64 });
  }
  if (opt(i, "mode") === "list") return reply({ content: s.follows[id] ? `This channel follows: **${followName(s.follows[id])}**` : "This channel doesn't follow any creators. Try `/follow creator:<name>`.", flags: 64 });
  const t = await topicOf(i); if (t.error) return reply({ content: t.error, flags: 64 });
  if (!t.creators) return reply({ content: "Pick at least one creator: start typing in `creator` and choose a name from the list.", flags: 64 });
  const words = String(opt(i, "words") || "").split(",").map((w) => cleanChar(w).toLowerCase()).filter(Boolean).slice(0, 10);
  s.follows[id] = { channel: i.channel_id, creators: t.creators, words: words.join("|"), at: new Date().toISOString() };
  await saveState(s);
  return reply({ content: `✅ This channel now gets every new video from **${followName(s.follows[id])}** as soon as it is on Fanreelz (checked every 10 minutes). \`/follow mode:off\` stops it.` });
}
// /daily: a server admin turns the daily post on in this channel (with an optional world and/or character), or off
async function daily(i) {
  if (!i.guild_id) return reply({ content: "Use /daily in a server channel. In private messages, try /today.", flags: 64 });
  const perms = BigInt(i.member?.permissions || "0");
  if (!(perms & 0x20n) && !(perms & 0x8n)) return reply({ content: "Only people who can manage this server can turn the daily video on or off.", flags: 64 });
  const s = await loadState(), id = i.guild_id + ":" + i.channel_id;
  if (opt(i, "mode") === "off") {
    const had = !!s.channels[id];
    delete s.channels[id]; await saveState(s);
    return reply({ content: had ? "Daily AI video turned off in this channel." : "The daily AI video wasn't on in this channel.", flags: 64 });
  }
  const t = await topicOf(i); if (t.error) return reply({ content: t.error, flags: 64 });
  // post today's film right away: that shows the choice works and proves the bot can write in this channel
  const f = await todaysPick(s, t);
  if (!f) return reply({ content: `No AI fan films found for ${topicName(t)} yet. Try another name, or leave it empty for all films.`, flags: 64 });
  const res = await postTo(i.channel_id, f, t, i.guild_id);
  if (!res.ok) return reply({ content: `I can't post in this channel yet. Add the Fanreelz bot to the server (${SITE}/discord) and let it send messages here, then try /daily again.`, flags: 64 });
  s.channels[id] = { channel: i.channel_id, cat: t.cat, char: t.char, creators: t.creators || "", at: new Date().toISOString() };
  await saveState(s);
  return reply({ content: `✅ Daily AI video is on in this channel: **${topicName(t)}**, every day at 16:00 UTC.${t.cat.includes(",") ? " Each day one of these worlds is picked at random." : ""} Run /daily again to change it, or \`/daily mode:off\` to stop.`, flags: 64 });
}
const help = () => reply({ embeds: [{ color: COLOR, title: "Fanreelz bot", url: SITE, description: [
  "`/top [category]` the 5 most watched AI fan films",
  "`/random [category]` a random AI fan film to watch",
  "`/search <words>` find AI fan films",
  "`/showdown` who would win? The hottest Character Showdown",
  "`/today [category] [character] [creator]` today's AI video of the day",
  "`/daily [category] [category2] [category3] [character]` (server admins) post a popular AI video in this channel every day, from one world or a random one of up to three; `mode:off` stops it",
  "`/follow creator:<name> [creator2] [creator3] [words]` (server admins) post every NEW video from these creators here, e.g. `words:warcraft, roblox` for only those; `mode:off` stops it, `mode:list` shows it",
  "`/daily creator:<name>` only videos from one YouTube creator; add `creator2`/`creator3` (or names separated by commas) to mix several creators",
].join("\n") }] });

// every answer: links carry "via=discord" and the server, so the statistics show which server sent the visitor
export default async (req) => {
  const res = await handle(req.clone());
  if (req.method !== "POST" || !(res.headers.get("Content-Type") || "").includes("json")) return res;
  let gid = "";
  try { gid = JSON.parse(await req.text()).guild_id || ""; } catch {}
  return new Response(tagLinks(await res.text(), gid), { status: res.status, headers: res.headers });
};
async function handle(req) {
  if (req.method !== "POST") return new Response("Fanreelz Discord bot. Add it from https://fanreelz.com/discord", { status: 200 });
  const body = await req.text();
  if (!(await verify(body, req.headers.get("x-signature-ed25519") || "", req.headers.get("x-signature-timestamp") || ""))) return new Response("bad signature", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 }); // Discord checking the endpoint
  if (i.type === 4) { // autocomplete for the category option
    const foc = (i.data.options || []).find((o) => o.focused), t = String(foc?.value || "").toLowerCase();
    if (/^creator/.test(foc?.name || "")) { // YouTube creators Fanreelz has (the last name after a comma is what's being typed)
      const parts = String(foc.value || "").split(","), last = parts.pop().trim(), done = parts.map((x) => x.trim()).filter(Boolean);
      const hits = await findCreators(last).catch(() => []);
      const pre = done.length ? done.join(", ") + ", " : "";
      return json({ type: 8, data: { choices: hits.slice(0, 25).map((n) => ({ name: (pre + n).slice(0, 100), value: (pre + n).slice(0, 100) })) } });
    }
    if (foc?.name === "character") { // characters Fanreelz knows, from the chosen world first; anything else typed still works
      const c = findCat(opt(i, "category")), names = [...new Set([...(c?.chars || []), ...CATS.flatMap((x) => x.chars || [])])];
      const hit = names.filter((n) => !t || n.toLowerCase().includes(t)).slice(0, 25);
      const typed = cleanChar(foc.value);
      return json({ type: 8, data: { choices: (typed && !hit.some((n) => n.toLowerCase() === typed.toLowerCase()) ? [typed, ...hit].slice(0, 25) : hit).map((n) => ({ name: n, value: n })) } });
    }
    const list = CHOOSABLE.filter((c) => !t || c.name.toLowerCase().includes(t) || c.id.includes(t)).slice(0, 25);
    return json({ type: 8, data: { choices: list.map((c) => ({ name: c.name, value: c.id })) } });
  }
  if (i.type !== 2) return json({ type: 1 });
  try {
    switch (i.data.name) {
      case "top": return await top(i);
      case "random": return await random(i);
      case "search": return await search(i);
      case "showdown": return await showdown();
      case "today": return await today(i);
      case "daily": return await daily(i);
      case "follow": return await follow(i);
      default: return help();
    }
  } catch (e) {
    console.error(e);
    return reply({ content: "Fanreelz couldn't answer right now. Try again in a moment.", flags: 64 });
  }
}
export const config = { path: "/api/discord" };
