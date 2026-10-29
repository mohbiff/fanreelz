// "AI video of the day" for Discord. Server admins type /daily on in a channel; every day at 16:00 UTC (17:00/18:00 in Sweden)
// the bot posts one popular AI fan film there. /today shows today's pick to anyone.
// The list of channels and today's pick live in import_state (key "discord_daily"), which only the server can read or change.
// Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DISCORD_BOT_TOKEN.
const SITE = "https://fanreelz.com";
const KEY = "discord_daily";
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n || 0));
const env = (k) => Netlify.env.get(k);
const head = () => ({ apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"), "Content-Type": "application/json" });

export async function loadState() {
  const r = await fetch(env("SUPABASE_URL") + `/rest/v1/import_state?key=eq.${KEY}&select=value`, { headers: head() });
  if (!r.ok) throw new Error("db " + r.status);
  const v = ((await r.json())[0] || {}).value || {};
  return { channels: v.channels || {}, sent: v.sent || [], today: v.today || null };
}
export async function saveState(s) {
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/import_state", { method: "POST", headers: { ...head(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify([{ key: KEY, value: s }]) });
  if (!r.ok) throw new Error("db save " + r.status);
}

// today's film: one of the most watched (not shown in the last ~4 months), the more views the likelier; the same for every server all day
export async function todaysPick(s) {
  const date = new Date().toISOString().slice(0, 10);
  if (s.today?.date === date && s.today.film) return s.today.film;
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/catalog?select=id,title,views,video_id,channel,cat,duration,format&hidden=eq.false&age_restricted=eq.false&platform=eq.YouTube&views=gte.20000&order=views.desc&limit=400", { headers: head() });
  if (!r.ok) throw new Error("db " + r.status);
  const seen = new Set(s.sent);
  // under 30 minutes, so talks and podcasts that mention AI don't get picked
  const all = (await r.json()).filter((f) => !f.duration || f.duration <= 1800);
  let pool = all.filter((f) => !seen.has(f.id));
  if (!pool.length) { s.sent = []; pool = all; }
  if (!pool.length) return null;
  const w = pool.map((f) => Math.sqrt(f.views || 1)), total = w.reduce((a, b) => a + b, 0);
  let x = Math.random() * total, film = pool[0];
  for (let k = 0; k < pool.length; k++) { x -= w[k]; if (x <= 0) { film = pool[k]; break; } }
  s.today = { date, film };
  s.sent = [...s.sent, film.id].slice(-120);
  return film;
}

export const dailyMessage = (f) => ({
  content: `🎬 **AI video of the day**\n**${f.title.replace(/[*_~`]/g, "")}**${f.channel ? ` by ${f.channel}` : ""}${f.views ? ` · ${fmt(f.views)} views` : ""}\nRate it on Fanreelz: <${SITE}/${f.format === "short" ? "shorts" : "film"}/${encodeURIComponent(f.id)}>\nhttps://www.youtube.com/watch?v=${f.video_id}`,
  allowed_mentions: { parse: [] },
});

export async function postTo(channel, f) {
  const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: "POST", headers: { Authorization: "Bot " + env("DISCORD_BOT_TOKEN"), "Content-Type": "application/json" }, body: JSON.stringify(dailyMessage(f)) });
  return { ok: r.ok, status: r.status };
}

// the daily run (cron "0 16 * * *"): post today's film in every channel that asked for it; channels the bot can no longer reach are dropped
export default async () => {
  const s = await loadState();
  const ids = Object.keys(s.channels);
  if (!ids.length) return new Response("no channels");
  const f = await todaysPick(s);
  if (!f) return new Response("no film");
  let sent = 0;
  for (const g of ids) {
    const res = await postTo(s.channels[g].channel, f);
    if (res.ok) sent++;
    else if ([403, 404].includes(res.status)) delete s.channels[g];
  }
  await saveState(s);
  return new Response(`posted ${f.id} in ${sent} of ${ids.length} channels`);
};
export const config = { schedule: "0 16 * * *" };
