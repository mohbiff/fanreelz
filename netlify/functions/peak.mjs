// Most visitors online at the same time on Fanreelz. Umami only knows "online now" (the last 5 minutes),
// so this samples it every minute (Cloudflare schedule) and keeps the record, plus today's highest, in import_state ("peak_online").
import { umamiConn } from "./moderate.mjs";

const sb = () => {
  const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
  return { url: Netlify.env.get("SUPABASE_URL") + "/rest/v1/import_state", h };
};
const day = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export async function readPeak() {
  const { url, h } = sb();
  const r = await fetch(url + "?key=eq.peak_online&select=value", { headers: h });
  return r.ok ? (await r.json().catch(() => []))?.[0]?.value || null : null;
}

// fold one "online now" reading into the record; saves only when something changed
export async function notePeak(n, prev) {
  n = Math.max(0, Math.round(+n || 0));
  const now = Date.now(), today = day(now);
  const p = prev === undefined ? await readPeak() : prev;
  const v = { n: p?.n || 0, at: p?.at || null, day: p?.day === today ? p.day : today, dn: p?.day === today ? p.dn || 0 : 0, dat: p?.day === today ? p.dat || null : null };
  // highest per day, the last 90 days ({"2026-10-29": 4, …})
  v.hist = { ...(p?.hist || {}) };
  let ch = !p || p.day !== today;
  // every new all-time record is kept: [{n, at}], newest last (the first sample counts as the first record)
  v.records = [...(p?.records || (p?.n ? [{ n: p.n, at: p.at }] : []))];
  if (n > v.n) { v.n = n; v.at = new Date(now).toISOString(); v.records.push({ n, at: v.at }); ch = true; }
  v.records = v.records.slice(-200);
  if (n > v.dn) { v.dn = n; v.dat = new Date(now).toISOString(); ch = true; }
  if ((v.hist[today] || 0) < v.dn) { v.hist[today] = v.dn; ch = true; }
  const keys = Object.keys(v.hist).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete v.hist[k];
  if (ch) {
    const { url, h } = sb();
    await fetch(url, { method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: "peak_online", value: v }]) }).catch(() => {});
  }
  return v;
}

const num = (x) => (x && typeof x === "object" ? +(x.visitors ?? x.x ?? x.value) || 0 : +x || 0);
export default async () => {
  const c = await umamiConn();
  if (c.error) return new Response(c.error);
  const r = await fetch(c.base + "/active", { headers: c.headers }).catch(() => null);
  if (!r || !r.ok) return new Response("umami " + (r ? r.status : "x"));
  const a = await r.json().catch(() => null);
  const v = await notePeak(num(Array.isArray(a) ? a[0] : a));
  return new Response(JSON.stringify(v));
};
