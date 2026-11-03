// Paid requests (step 1, no money moves yet).
// A fan posts an idea with a pledge (at least 2 €); other fans add pledges. Days 0–3: verified creators say "I'll make it".
// Days 3–7: everyone who pledged votes (one vote each) for the creator who should make it. The winner has 30 days to deliver.
// Pledges are promises: when payments open (Stripe), a pledge is charged only after the film is delivered; 80 % goes to the creator.
// Each request is one row in import_state ("prq:<id>"), written only here, with the secret key.
// A request can also be for one chosen verified creator: no offers or vote; that creator accepts (or declines) within 7 days.
// POST /api/paid-requests {action:"list"|"creators"|"create"|"pledge"|"unpledge"|"apply"|"vote"|"accept"|"decline"|"deliver"|"remove", ...}
import { whoIs, isAdmin } from "./moderate.mjs";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const DAY = 864e5, APPLY_DAYS = 3, VOTE_DAYS = 4, DELIVER_DAYS = 30, MIN_CENTS = 200, MAX_CENTS = 50000, CREATOR_SHARE = 0.8;
const db = () => {
  const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
  return { url: Netlify.env.get("SUPABASE_URL") + "/rest/v1/import_state", h };
};
async function readAll() {
  const { url, h } = db();
  const r = await fetch(url + "?key=like.prq:*&select=key,value&limit=500", { headers: h });
  if (!r.ok) throw new Error("db " + r.status);
  return (await r.json()).map((x) => x.value).filter(Boolean);
}
async function readOne(id) {
  const { url, h } = db();
  const r = await fetch(url + "?key=eq." + encodeURIComponent("prq:" + id) + "&select=value", { headers: h });
  if (!r.ok) throw new Error("db " + r.status);
  return (await r.json())[0]?.value || null;
}
async function save(q) {
  const { url, h } = db();
  const r = await fetch(url, { method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: "prq:" + q.id, value: q }]) });
  if (!r.ok) throw new Error("save " + r.status);
}
async function remove(id) {
  const { url, h } = db();
  await fetch(url + "?key=eq." + encodeURIComponent("prq:" + id), { method: "DELETE", headers: h });
}
// the YouTube channels this account has verified (creator-owner:<channel> rows, see creator-profile.mjs)
async function myChannels(uid) {
  const { url, h } = db();
  const r = await fetch(url + "?key=like.creator-owner:*&value->>userId=eq." + encodeURIComponent(uid) + "&select=key,value", { headers: h });
  if (!r.ok) return [];
  return (await r.json()).map((x) => ({ id: x.key.slice("creator-owner:".length), name: x.value?.channel || x.value?.title || x.value?.name || "" }));
}

const clean = (t, n) => String(t || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const cents = (x) => Math.round(Number(x) * 100);
// where a request is now, worked out from its dates (nothing has to run on a schedule)
// a request for one chosen creator: no offers or voting; the creator accepts within 7 days, then has 30 days to deliver
const ANSWER_DAYS = 7;
function phaseOf(q, now = Date.now()) {
  if (q.delivered) return "delivered";
  if (q.for) {
    if (q.declined) return "declined";
    if (!q.acceptedAt) return now < q.created + ANSWER_DAYS * DAY ? "waiting" : "notaken";
    return now < q.acceptedAt + DELIVER_DAYS * DAY ? "making" : "expired";
  }
  const t = q.created, applyEnd = t + APPLY_DAYS * DAY, voteEnd = applyEnd + VOTE_DAYS * DAY;
  if (now < applyEnd) return "apply";
  if (!Object.keys(q.apps || {}).length) return "notaken"; // nobody offered to make it: pledges are released
  if (now < voteEnd) return "vote";
  if (now < voteEnd + DELIVER_DAYS * DAY) return "making";
  return "expired"; // not delivered in time: pledges are released
}
function winnerOf(q) {
  const tally = {};
  for (const ch of Object.values(q.votes || {})) tally[ch] = (tally[ch] || 0) + 1;
  const apps = Object.entries(q.apps || {});
  if (!apps.length) return null;
  // most votes; a tie goes to whoever offered first
  apps.sort((a, b) => (tally[b[0]] || 0) - (tally[a[0]] || 0) || a[1].at - b[1].at);
  return apps[0][0];
}
// what the page may see: totals, never who pledged how much
function view(q, uid, admin) {
  const ph = phaseOf(q), pledges = Object.values(q.pledges || {}), total = pledges.reduce((a, p) => a + p.cents, 0);
  const tally = {};
  for (const ch of Object.values(q.votes || {})) tally[ch] = (tally[ch] || 0) + 1;
  const showApps = ph !== "apply" || admin; // creators who offered are shown after the first 3 days
  const win = q.for ? (q.acceptedAt || q.delivered ? q.for.channel : null) : ["making", "expired", "delivered"].includes(ph) ? q.winner || winnerOf(q) : null;
  const winApp = q.for ? { name: q.for.name, uid: q.for.uid } : q.apps?.[win];
  return {
    id: q.id, title: q.title, note: q.note, cat: q.cat, char: q.char, by: q.byName || "a Fanreelz member", mineRequest: q.by === uid,
    created: q.created, applyEnd: q.created + APPLY_DAYS * DAY, voteEnd: q.created + (APPLY_DAYS + VOTE_DAYS) * DAY,
    deliverBy: q.for ? (q.acceptedAt ? q.acceptedAt + DELIVER_DAYS * DAY : null) : q.created + (APPLY_DAYS + VOTE_DAYS + DELIVER_DAYS) * DAY, phase: ph,
    answerBy: q.for ? q.created + ANSWER_DAYS * DAY : null, for: q.for ? { channel: q.for.channel, name: q.for.name, mine: q.for.uid === uid } : null,
    total, backers: pledges.length, myPledge: q.pledges?.[uid]?.cents || 0, myVote: q.votes?.[uid] || null,
    appCount: Object.keys(q.apps || {}).length, myApp: Object.values(q.apps || {}).some((a) => a.uid === uid),
    apps: showApps ? Object.entries(q.apps || {}).map(([ch, a]) => ({ channel: ch, name: a.name, sample: a.sample, votes: tally[ch] || 0, mine: a.uid === uid })) : [],
    winner: win ? { channel: win, name: winApp?.name || "", mine: winApp?.uid === uid } : null,
    delivered: q.delivered || null, creatorShare: Math.round(total * CREATOR_SHARE),
  };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const u = await whoIs(req), uid = u?.id || null, admin = isAdmin(u);
  try {
    if (body.action === "list") {
      const all = (await readAll()).sort((a, b) => b.created - a.created);
      return json({ requests: all.map((q) => view(q, uid, admin)), myChannels: uid ? await myChannels(uid) : [], rules: { min: MIN_CENTS, applyDays: APPLY_DAYS, voteDays: VOTE_DAYS, deliverDays: DELIVER_DAYS, creatorShare: CREATOR_SHARE }, payments: false });
    }
    if (body.action === "creators") {
      // verified creators that can be chosen for a request
      const { url, h } = db();
      const r = await fetch(url + "?key=like.creator-owner:*&select=key,value&limit=1000", { headers: h });
      const rows = r.ok ? await r.json() : [];
      return json({ creators: rows.filter((x) => x.value?.userId).map((x) => x.key.slice("creator-owner:".length)) });
    }
    if (!uid) return json({ error: "Sign in first" }, 401);
    const name = clean(u.user_metadata?.full_name || u.user_metadata?.name || u.user_metadata?.user_name || "", 60) || "a Fanreelz member";

    if (body.action === "create") {
      const title = clean(body.title, 140), note = clean(body.note, 400), c = cents(body.amount);
      if (title.length < 5) return json({ error: "Describe the film in a few words" }, 400);
      if (!(c >= MIN_CENTS && c <= MAX_CENTS)) return json({ error: "Pledge at least 2 €" }, 400);
      const mine = (await readAll()).filter((q) => q.by === uid && ["apply", "vote", "waiting"].includes(phaseOf(q))).length;
      if (mine >= 5) return json({ error: "You already have 5 open requests" }, 429);
      // optionally for one verified creator only
      let forCreator = null;
      if (body.creator) {
        const ch = String(body.creator);
        const { url, h } = db();
        const r = await fetch(url + "?key=eq." + encodeURIComponent("creator-owner:" + ch) + "&select=value", { headers: h });
        const owner = r.ok ? (await r.json())[0]?.value : null;
        if (!owner?.userId) return json({ error: "That creator hasn't verified their channel on Fanreelz yet" }, 400);
        if (owner.userId === uid) return json({ error: "You can't request a film from yourself" }, 400);
        forCreator = { channel: ch, uid: owner.userId, name: clean(body.creatorName, 80) || "YouTube creator" };
      }
      const q = { id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, note, cat: clean(body.cat, 40), char: clean(body.char, 40),
        by: uid, byName: name, created: Date.now(), pledges: { [uid]: { cents: c, at: Date.now() } }, apps: {}, votes: {}, ...(forCreator ? { for: forCreator } : {}) };
      await save(q);
      return json({ request: view(q, uid, admin) });
    }
    const q = await readOne(String(body.id || ""));
    if (!q) return json({ error: "Request not found" }, 404);
    const ph = phaseOf(q);

    if (body.action === "pledge") {
      const c = cents(body.amount);
      if (!["apply", "vote", "waiting"].includes(ph) && !(q.for && ph === "making")) return json({ error: "Pledging has closed for this request" }, 409);
      if (!(c >= MIN_CENTS && c <= MAX_CENTS)) return json({ error: "Pledge at least 2 €" }, 400);
      q.pledges = { ...(q.pledges || {}), [uid]: { cents: c, at: Date.now() } };
      // backing during the vote can choose the creator in the same step
      if (ph === "vote" && body.channel && q.apps?.[String(body.channel)]) q.votes = { ...(q.votes || {}), [uid]: String(body.channel) };
    } else if (body.action === "accept" || body.action === "decline") {
      if (!q.for || q.for.uid !== uid) return json({ error: "Only the chosen creator can answer" }, 403);
      if (ph !== "waiting") return json({ error: "This request has already been answered" }, 409);
      if (body.action === "accept") q.acceptedAt = Date.now(); else q.declined = Date.now();
    } else if (body.action === "unpledge") {
      if (!["apply", "vote", "waiting"].includes(ph)) return json({ error: "The pledge can't be changed any more" }, 409);
      if (q.by === uid) return json({ error: "The person who started the request keeps a pledge on it" }, 409);
      delete q.pledges?.[uid]; delete q.votes?.[uid];
    } else if (body.action === "apply") {
      if (q.for) return json({ error: "This request is for one chosen creator" }, 409);
      if (ph !== "apply") return json({ error: "Creators can only offer during the first 3 days" }, 409);
      const ch = (await myChannels(uid)).find((c) => c.id === String(body.channel || ""));
      if (!ch) return json({ error: "Only verified creators can take requests. Claim your creator profile first." }, 403);
      const sample = /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s"<>]+$/.test(String(body.sample || "")) ? String(body.sample).slice(0, 200) : "";
      q.apps = { ...(q.apps || {}), [ch.id]: { uid, name: clean(body.name, 80) || ch.name || "YouTube creator", sample, at: Date.now() } };
    } else if (body.action === "vote") {
      if (ph !== "vote") return json({ error: "Voting is open from day 3 to day 7" }, 409);
      if (!q.pledges?.[uid]) return json({ error: "Back the request with a pledge to vote" }, 403);
      if (!q.apps?.[String(body.channel || "")]) return json({ error: "Unknown creator" }, 400);
      q.votes = { ...(q.votes || {}), [uid]: String(body.channel) };
    } else if (body.action === "deliver") {
      if (ph !== "making") return json({ error: "This request isn't waiting for a film" }, 409);
      const win = q.for ? q.for.channel : q.winner || winnerOf(q);
      if ((q.for ? q.for.uid : q.apps?.[win]?.uid) !== uid) return json({ error: "Only the chosen creator can deliver the film" }, 403);
      const link = String(body.url || "");
      if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s"<>]+$/.test(link)) return json({ error: "Paste the YouTube link to the film" }, 400);
      q.winner = win; q.delivered = { url: link.slice(0, 200), at: Date.now() };
    } else if (body.action === "remove") {
      if (!admin && !(q.by === uid && ["apply", "waiting"].includes(ph) && Object.keys(q.pledges || {}).length <= 1)) return json({ error: "Only admins can remove a request others have backed" }, 403);
      await remove(q.id);
      return json({ removed: true });
    } else return json({ error: "Unknown action" }, 400);
    if (ph === "vote" && !q.winner) q.winner = null;
    await save(q);
    return json({ request: view(q, uid, admin) });
  } catch (e) {
    return json({ error: "Requests are unavailable right now. Please try again." }, 503);
  }
};
export const config = { path: "/api/paid-requests" };
