// Fanreelz bot for Discord. Discord sends each slash command here (Interactions Endpoint URL = https://fanreelz.com/api/discord),
// so no always-on server is needed. Commands: /top, /random, /search, /showdown, /fanreelz.
// Needs in Netlify: DISCORD_PUBLIC_KEY (from the Discord app's General Information page), SUPABASE_URL, SUPABASE_ANON_KEY.
import crypto from "node:crypto";
import CATS from "./lib/catmap.mjs";

const SITE = "https://fanreelz.com";
const COLOR = 0xffd23f;
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n || 0));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const reply = (data) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...data } });
const CHOOSABLE = CATS.filter((c) => !["aiseries"].includes(c.id));

function verify(body, sig, ts) {
  try {
    const raw = Buffer.from(Netlify.env.get("DISCORD_PUBLIC_KEY") || "", "hex");
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(ts + body), key, Buffer.from(sig, "hex"));
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
  const rows = await sb(`catalog?select=id,title,views,video_id,channel&hidden=eq.false&age_restricted=eq.false${c ? "&cat=eq." + c.id : ""}&order=views.desc&limit=200`);
  if (!rows.length) return reply({ content: "No films found.", flags: 64 });
  const r = rows[Math.floor(Math.random() * rows.length)];
  return reply({ content: `🎬 **${r.title}**${r.channel ? ` by ${r.channel}` : ""}\nRate it on Fanreelz: <${filmUrl(r)}>\nhttps://www.youtube.com/watch?v=${r.video_id}` });
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
const help = () => reply({ embeds: [{ color: COLOR, title: "Fanreelz bot", url: SITE, description: [
  "`/top [category]` the 5 most watched AI fan films",
  "`/random [category]` a random AI fan film to watch",
  "`/search <words>` find AI fan films",
  "`/showdown` who would win? The hottest Character Showdown",
].join("\n") }] });

export default async (req) => {
  if (req.method !== "POST") return new Response("Fanreelz Discord bot. Add it from https://fanreelz.com/discord", { status: 200 });
  const body = await req.text();
  if (!verify(body, req.headers.get("x-signature-ed25519") || "", req.headers.get("x-signature-timestamp") || "")) return new Response("bad signature", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 }); // Discord checking the endpoint
  if (i.type === 4) { // autocomplete for the category option
    const t = String((i.data.options || []).find((o) => o.focused)?.value || "").toLowerCase();
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
      default: return help();
    }
  } catch (e) {
    console.error(e);
    return reply({ content: "Fanreelz couldn't answer right now. Try again in a moment.", flags: 64 });
  }
};
export const config = { path: "/api/discord" };
