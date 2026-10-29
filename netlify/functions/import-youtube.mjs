// Fanreelz importer: grows the catalogue with AI fan films from YouTube, every 2 hours.
//
// How it stays inside YouTube's free daily quota (10,000 units; the live search already uses about 7,200):
//  1. One search per run (100 units) for a rotating topic, to discover channels that make AI fan films.
//  2. A channel counts as an "AI channel" when most of its recent uploads look AI-made.
//  3. For AI channels it reads the upload list (1 unit per 50 videos) and keeps the fan films.
//  4. Video details (length, embeddable, age limit) cost 1 unit per 50 videos.
// About 150–250 units per run, 12 runs a day.
//
// Needs in Netlify: YOUTUBE_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (secret; never in the page).
import { classify, AI_RE, VOICE_RE, BLOCK_RE } from "./lib/classify.mjs";

const TOPICS = [
  "AI fan film", "AI movie trailer", "as an 80s dark fantasy film", "1950s super panavision 70", "AI live action anime",
  "AI cinematic warcraft", "AI warhammer 40k film", "AI lord of the rings film", "AI skyrim movie", "AI dark souls film",
  "AI elden ring movie", "AI league of legends cinematic", "AI dota 2 movie", "AI minecraft movie", "AI roblox movie",
  "AI GTA 6 trailer", "AI zelda movie", "AI naruto live action", "AI one piece live action", "AI dragon ball live action",
  "AI berserk live action", "AI game of thrones 1950s", "AI harry potter 1950s", "AI dune trailer", "AI witcher film",
  "AI fallout 1950s", "AI starcraft movie", "AI diablo movie", "italian brainrot AI story", "veo 3 short film",
  "kling ai short film", "sora ai short film", "AI mythology film", "AI D&D movie", "AI age of empires cinematic",
  "Fruit Love Island episode", "AI series episode 1", "AI web series episode", "AI animated series episode", "AI anime series episode 1", "AI cinematic series part 1", "AI sitcom episode", "AI fan series season 1",
  "AI pokemon live action", "AI fortnite movie", "fortnite live action AI", "fortnite AI short film", "rocket league AI movie", "rocket league live action AI", "rocket league AI cinematic", "AI warcraft 3 cinematic remake", "AI world of warcraft movie",
];
// Searches around the world: every other hourly search uses one of these, with YouTube told which country and language to favour
const WORLD = [
  // Middle East
  { r: "SA", l: "ar", q: "فيلم بالذكاء الاصطناعي" }, { r: "EG", l: "ar", q: "كرتون بالذكاء الاصطناعي" }, { r: "AE", l: "ar", q: "مسلسل ذكاء اصطناعي" }, { r: "TR", l: "tr", q: "yapay zeka kısa film" },
  // Europe
  { r: "DE", l: "de", q: "KI Kurzfilm" }, { r: "FR", l: "fr", q: "court métrage IA" }, { r: "ES", l: "es", q: "cortometraje IA" }, { r: "IT", l: "it", q: "cortometraggio IA" },
  { r: "PL", l: "pl", q: "film AI krótki" }, { r: "SE", l: "sv", q: "AI film kortfilm" }, { r: "GB", l: "en", q: "AI fan film" }, { r: "NL", l: "nl", q: "AI film" }, { r: "RU", l: "ru", q: "нейросеть фильм" },
  // Asia
  { r: "JP", l: "ja", q: "AI実写化 映画" }, { r: "KR", l: "ko", q: "AI 영화 실사화" }, { r: "TW", l: "zh-Hant", q: "AI 電影 短片" }, { r: "IN", l: "hi", q: "AI movie trailer hindi" },
  { r: "ID", l: "id", q: "film pendek AI" }, { r: "TH", l: "th", q: "หนังสั้น AI" }, { r: "VN", l: "vi", q: "phim ngắn AI" }, { r: "PH", l: "en", q: "AI short film" },
  // Africa
  { r: "NG", l: "en", q: "AI animated short film" }, { r: "ZA", l: "en", q: "AI movie trailer" }, { r: "MA", l: "fr", q: "film IA animation" }, { r: "KE", l: "en", q: "AI film" },
  // Latin America
  { r: "MX", l: "es", q: "película IA" }, { r: "BR", l: "pt", q: "filme feito com IA" }, { r: "AR", l: "es", q: "corto animado IA" }, { r: "CO", l: "es", q: "tráiler IA" },
  // America
  { r: "US", l: "en", q: "AI movie trailer" }, { r: "CA", l: "en", q: "AI cinematic short film" },
  // Rest of the world
  { r: "AU", l: "en", q: "AI fan film" }, { r: "NZ", l: "en", q: "AI short film" },
];
// Topics added later are searched first, once each, before the normal rotation continues
const NEW_TOPICS = [
  "pink panther AI", "popeye live action AI", "garfield live action AI", "snoopy AI", "pippi longstocking AI", "bamse AI", "moomin AI", "pingu AI", "teletubbies AI horror",
  "he-man AI movie", "transformers AI trailer", "ninja turtles AI live action", "power rangers AI trailer", "thundercats AI live action", "ducktales live action AI", "inspector gadget AI", "ghostbusters AI trailer", "care bears AI",
  "godzilla AI movie", "king kong AI", "robin hood AI film", "king arthur AI film", "zorro AI", "tarzan AI", "sinbad AI", "1001 nights AI film", "hellboy AI", "spawn AI", "judge dredd AI", "conan the barbarian AI",
  "monty python AI", "austin powers AI", "willy wonka AI", "gremlins AI", "forrest gump AI", "studio ghibli live action AI", "sailor moon live action AI", "attack on titan live action AI",
  "demon slayer live action AI", "jujutsu kaisen live action AI", "death note AI", "doraemon live action AI", "captain tsubasa AI", "كابتن ماجد ذكاء اصطناعي", "grendizer AI", "جريندايزر ذكاء اصطناعي",
  "flintstones live action AI", "wizard of oz AI", "pinocchio AI film",
  "mr bean AI movie", "mr bean AI series", "mr bean AI short", "charlie chaplin AI film", "charlie chaplin AI short", "the godfather AI trailer", "the godfather 1950s panavision",
  "scarface AI movie", "scarface 80s dark fantasy", "breaking bad AI trailer", "star wars AI trailer", "star wars 1950s panavision", "harry potter AI trailer", "harry potter 1950s panavision",
  "marvel AI movie trailer", "batman AI movie", "james bond AI trailer", "terminator AI trailer", "the matrix AI film", "back to the future AI", "jurassic park AI", "indiana jones AI trailer",
  "titanic AI movie", "home alone AI", "peaky blinders AI", "pulp fiction AI", "sopranos AI", "laurel and hardy AI", "dracula AI film", "stranger things AI", "squid game AI",
  "disney live action AI", "disney pixar AI trailer", "simpsons live action AI", "tom and jerry live action AI", "looney tunes AI", "spongebob live action AI", "shrek live action AI",
  "tintin AI film", "asterix AI", "scooby doo live action AI", "flintstones live action AI",
  "Pat and Mat AI", "Pat a Mat AI", "Pat & Mat AI live action", "بات ومات ذكاء اصطناعي",
  "وتين وكنان ذكاء اصطناعي", "قصص اطفال كرتون بالذكاء الاصطناعي", "مسلسل كرتون عربي ai", "حكايات كرتون ذكاء اصطناعي", "كرتون اسلامي بالذكاء الاصطناعي", "كرتون خليجي بالذكاء الاصطناعي",
  "Tom Sawyer AI live action", "Tom Sawyer AI film", "توم سوير بالذكاء الاصطناعي", "مغامرات توم سوير ذكاء اصطناعي", "トム・ソーヤー AI実写",
  "AI full movie", "AI feature film full length", "full AI animated movie", "AI fan film full movie", "فيلم كامل بالذكاء الاصطناعي", "AI movie 30 minutes",
  "未来少年コナン AI実写", "미래소년 코난 AI", "عدنان ولينا واقعي بالذكاء الاصطناعي", "Future Boy Conan AI real life",
  "كرتون بالذكاء الاصطناعي الحلقة 1", "مسلسل كرتون بالذكاء الاصطناعي", "كرتون مصري بالذكاء الاصطناعي", "قصص ذكاء اصطناعي كرتون", "انيميشن عربي بالذكاء الاصطناعي", "مسلسل بالذكاء الاصطناعي الحلقة",
  "AI among us movie", "AI clash of clans movie", "AI brawl stars movie", "AI subway surfers live action", "AI fall guys movie", "AI pubg movie", "AI free fire movie", "AI honor of kings cinematic", "AI mobile legends movie", "AI counter strike movie", "AI valorant movie", "AI apex legends movie", "AI overwatch movie", "AI rainbow six siege movie", "AI marvel rivals movie", "AI genshin impact live action", "AI honkai star rail live action", "AI ea sports fc movie", "AI destiny 2 movie", "AI dead by daylight movie", "AI the sims live action", "AI path of exile movie", "AI helldivers 2 movie", "AI ark survival movie", "AI terraria movie", "AI stardew valley live action", "AI monster hunter movie", "AI black myth wukong movie",
  "عدنان ولينا بالذكاء الاصطناعي", "عدنان ولينا واقعي", "future boy conan AI live action", "mirai shonen conan AI",
  "AI red dead redemption movie", "red dead redemption 1980s film AI", "AI the last of us movie", "AI god of war movie", "god of war live action AI", "AI metal gear solid movie", "AI mass effect movie", "AI uncharted movie", "AI final fantasy movie", "final fantasy 1980s film AI", "AI half-life movie", "AI portal movie glados", "AI silent hill film", "AI resident evil movie", "AI ghost of tsushima movie", "AI persona 5 live action", "AI super mario live action", "super mario 1980s film AI", "AI monkey island movie", "AI castlevania movie", "AI detroit become human film", "AI bioshock movie", "AI assassin's creed movie", "AI dragon age movie", "AI max payne movie", "AI kingdom hearts movie", "AI deus ex movie", "AI horizon zero dawn movie", "AI call of duty movie", "AI metroid movie samus", "AI yakuza kiryu movie", "AI shadow of the colossus film", "AI diablo 2 movie", "AI starcraft cinematic remake", "AI skyrim 1980s film", "AI bloodborne movie", "AI baldur's gate movie", "AI star wars knights of the old republic movie", "AI batman arkham movie", "AI zelda ocarina of time live action",
];
TOPICS.push(...NEW_TOPICS);
const PAGES_PER_CHANNEL = 4, MIN_AI_SHARE = 0.5;
// Channels per run: 6 on Netlify (every 2 hours); 3 on Cloudflare (every hour, which allows at most 50 outside calls per run)

// Channels Fanreelz always follows, even when their titles don't say "AI" (official channels of known AI series)
const SEED_CHANNELS = [
  "UC-3j3vvarvPtbs8ocwOK0Fg", // Fruit Love Island (AI Cinema), official YouTube channel for season 2
];

const yt = async (path, params) => {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  u.search = new URLSearchParams({ ...params, key: Netlify.env.get("YOUTUBE_API_KEY") });
  const r = await fetch(u);
  if (!r.ok) throw new Error(`YouTube ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
function db() {
  const url = Netlify.env.get("SUPABASE_URL"), key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
  const call = async (method, path, body, extra = {}) => {
    const r = await fetch(url + "/rest/v1/" + path, { method, headers: { ...h, ...extra }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`Supabase ${method} ${path.split("?")[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json().catch(() => null);
  };
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    upsert: (table, rows) => rows.length ? call("POST", table, rows, { Prefer: "resolution=merge-duplicates,return=minimal" }) : null,
  };
}
const iso = (d) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || ""); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };

async function run() {
  if (!Netlify.env.get("YOUTUBE_API_KEY") || !Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || !Netlify.env.get("SUPABASE_URL"))
    return { error: "Missing YOUTUBE_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  const PER_RUN_CHANNELS = +(Netlify.env.get("IMPORT_CHANNELS") || 6);
  const sb = db(), log = [];
  const state = ((await sb.get("import_state?key=eq.youtube&select=value"))[0] || {}).value || { topic: 0 };

  // 1. Discover channels with one search. The importer runs every 10 minutes, but searching costs 100 quota units,
  //    so it only searches about every 30 minutes; the other runs just read more of the queued channels (1 unit per 50 videos).
  const doSearch = !state.lastSearch || Date.now() - Date.parse(state.lastSearch) > 25 * 60e3; // a search about every 30 minutes (48 a day, ~4,800 quota units)
  const seen = new Set(state.seen || []);
  const fresh1 = doSearch ? NEW_TOPICS.find((t) => !seen.has(t)) : null;
  const world = !fresh1 && (state.topic % 2 === 1) ? WORLD[(state.world || 0) % WORLD.length] : null;
  const topic = fresh1 || (world ? world.q : TOPICS[state.topic % TOPICS.length]);
  if (fresh1) seen.add(fresh1);
  const known = new Set((await sb.get("catalog_channels?select=channel_id")).map((c) => c.channel_id));
  if (doSearch) {
  const found = await yt("search", { part: "snippet", type: "video", q: topic, maxResults: "50", safeSearch: "moderate", videoEmbeddable: "true", ...(world ? { regionCode: world.r, relevanceLanguage: world.l } : {}) });
  const newChannels = {};
  for (const it of found.items || []) {
    const s = it.snippet;
    if (AI_RE.test(s.title) || AI_RE.test(s.description)) newChannels[s.channelId] = s.channelTitle;
  }
  const fresh = Object.entries(newChannels).filter(([id]) => !known.has(id));
  if (fresh.length) {
    const info = await yt("channels", { part: "contentDetails,snippet", id: fresh.map(([id]) => id).slice(0, 50).join(",") });
    await sb.upsert("catalog_channels", (info.items || []).map((c) => ({
      channel_id: c.id, title: c.snippet.title, uploads: c.contentDetails.relatedPlaylists.uploads, status: "new", next_page: null,
    })));
  }
  log.push(`topic "${topic}"${world ? " [" + world.r + "]" : ""}: ${fresh.length} new channels`);
  }

  // Followed channels count as AI channels from the start
  const missing = SEED_CHANNELS.filter((id) => !known.has(id));
  if (missing.length) {
    const info = await yt("channels", { part: "contentDetails,snippet", id: missing.join(",") }).catch(() => ({ items: [] }));
    await sb.upsert("catalog_channels", (info.items || []).map((c) => ({
      channel_id: c.id, title: c.snippet.title, uploads: c.contentDetails.relatedPlaylists.uploads, status: "reading", next_page: null,
    })));
    log.push(`followed channels added: ${(info.items || []).map((c) => c.snippet.title).join(", ")}`);
  }

  // 2. Work through channels: new ones first, then ones with more pages to read
  // Followed channels (official AI series) go first, so new channels from searches can't push them back forever
  const seeds = await sb.get(`catalog_channels?status=in.(new,reading)&channel_id=in.(${SEED_CHANNELS.join(",")})&order=checked_at.asc.nullsfirst&limit=1`);
  const rest = await sb.get(`catalog_channels?status=in.(new,reading)&order=status.asc,checked_at.asc.nullsfirst&limit=${PER_RUN_CHANNELS}`);
  const queue = [...seeds, ...rest.filter((c) => !seeds.some((x) => x.channel_id === c.channel_id))].slice(0, PER_RUN_CHANNELS);
  let added = 0;
  for (const ch of queue) {
    let page = ch.next_page || undefined, rows = [], aiCount = ch.ai_count || 0, seen = ch.seen_count || 0, isAi = ch.status === "reading";
    for (let p = 0; p < PAGES_PER_CHANNEL; p++) {
      const pl = await yt("playlistItems", { part: "snippet", playlistId: ch.uploads, maxResults: "50", ...(page ? { pageToken: page } : {}) }).catch(() => null);
      if (!pl) { page = null; break; }
      const items = (pl.items || []).filter((i) => i.snippet?.resourceId?.videoId && i.snippet.title !== "Private video" && i.snippet.title !== "Deleted video");
      seen += items.length; aiCount += items.filter((i) => (AI_RE.test(i.snippet.title) || AI_RE.test(i.snippet.description || "")) && !VOICE_RE.test(i.snippet.title + " " + (i.snippet.description || ""))).length;
      if (!isAi) isAi = seen >= 10 && aiCount / seen >= MIN_AI_SHARE;
      for (const i of items) {
        const c = classify(i.snippet.title, i.snippet.description || "", isAi);
        if (c) rows.push({ v: i.snippet.resourceId.videoId, t: i.snippet.title, at: i.snippet.publishedAt, ...c });
      }
      page = pl.nextPageToken || null;
      if (!page) break;
      if (!isAi && seen >= 50) break; // not an AI channel: stop reading it
    }
    // 3. Details for the candidates: embeddable, not age-restricted, length
    const keep = [];
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const det = await yt("videos", { part: "contentDetails,status,statistics", id: batch.map((r) => r.v).join(",") }).catch(() => ({ items: [] }));
      const map = Object.fromEntries((det.items || []).map((d) => [d.id, d]));
      for (const r of batch) {
        const d = map[r.v];
        if (!d || !d.status?.embeddable || d.status?.privacyStatus !== "public") continue;
        // Age-restricted AI films are kept, but YouTube won't play them on other sites: the page links out instead
        const age = d.contentDetails?.contentRating?.ytRating === "ytAgeRestricted";
        const secs = iso(d.contentDetails.duration);
        if (secs < 8) continue;
        keep.push({
          id: "yt-" + r.v, platform: "YouTube", video_id: r.v, title: r.t.slice(0, 200), channel: ch.title, channel_id: ch.channel_id,
          cat: r.cat, char: r.char, lore: r.lore, format: secs <= 75 ? "short" : "film", duration: secs,
          views: +(d.statistics?.viewCount || 0), published_at: r.at,
          age_restricted: age,
        });
      }
    }
    await sb.upsert("catalog", keep);
    added += keep.length;
    await sb.upsert("catalog_channels", [{
      channel_id: ch.channel_id, title: ch.title, uploads: ch.uploads, next_page: page,
      status: !isAi && seen >= 50 ? "skipped" : page ? "reading" : "done", ai_count: aiCount, seen_count: seen, checked_at: new Date().toISOString(),
    }]);
    log.push(`${ch.title}: ${keep.length} films (${isAi ? "AI channel" : "mixed"}, ${page ? "more to read" : "finished"})`);
  }
  // Finished channels are re-checked for new uploads about once a week
  await sb.post("rpc/requeue_done_channels", {}).catch(() => null);
  await sb.upsert("import_state", [{ key: "youtube", value: { topic: !doSearch || fresh1 ? state.topic : state.topic + 1, seen: [...seen].slice(-300), lastSearch: doSearch ? new Date().toISOString() : state.lastSearch, world: (state.world || 0) + (doSearch && world ? 1 : 0), last: new Date().toISOString(), added } }]);
  return { added, log };
}

export default async () => {
  try { const r = await run(); console.log(JSON.stringify(r)); return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } }); }
  catch (e) { console.error(e); return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500 }); }
};

export const config = { schedule: "17 */2 * * *" };

// Admin "Find AI films now": one YouTube search for any words, and the AI fan films it finds go straight into the catalogue.
// Their channels are queued too, so the hourly importer reads the rest of their uploads later. Costs about 101 quota units.
export async function searchNow(q) {
  q = String(q || "").trim().slice(0, 80);
  if (!q) return { error: "Type what to search for" };
  const sb = db();
  const found = await yt("search", { part: "snippet", type: "video", q, maxResults: "50", safeSearch: "moderate", videoEmbeddable: "true" });
  const rows = [], chans = {};
  for (const it of found.items || []) {
    const sn = it.snippet, v = it.id?.videoId;
    // stricter than the channel importer: the title itself must say it's AI-made (descriptions mention "AI" for bots, tools…)
    if (!v || !AI_RE.test(sn.title)) continue;
    const c = classify(sn.title, sn.description || "", false);
    if (!c) continue;
    rows.push({ v, t: sn.title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'), at: sn.publishedAt, ch: sn.channelTitle, chId: sn.channelId, ...c });
    chans[sn.channelId] = true;
  }
  const keep = [];
  if (rows.length) {
    const det = await yt("videos", { part: "contentDetails,status,statistics", id: rows.map((r) => r.v).join(",") }).catch(() => ({ items: [] }));
    const map = Object.fromEntries((det.items || []).map((d) => [d.id, d]));
    for (const r of rows) {
      const d = map[r.v];
      if (!d || !d.status?.embeddable || d.status?.privacyStatus !== "public") continue;
      const secs = iso(d.contentDetails.duration);
      if (secs < 8) continue;
      keep.push({
        id: "yt-" + r.v, platform: "YouTube", video_id: r.v, title: r.t.slice(0, 200), channel: r.ch, channel_id: r.chId,
        cat: r.cat, char: r.char, lore: r.lore, format: secs <= 75 ? "short" : "film", duration: secs,
        views: +(d.statistics?.viewCount || 0), published_at: r.at, age_restricted: d.contentDetails?.contentRating?.ytRating === "ytAgeRestricted",
      });
    }
    await sb.upsert("catalog", keep);
  }
  // queue the channels for the hourly importer (only ones it doesn't know yet)
  const ids = Object.keys(chans);
  if (ids.length) {
    const known = new Set((await sb.get(`catalog_channels?select=channel_id&channel_id=in.(${ids.join(",")})`)).map((c) => c.channel_id));
    const fresh = ids.filter((id) => !known.has(id));
    if (fresh.length) {
      const info = await yt("channels", { part: "contentDetails,snippet", id: fresh.join(",") }).catch(() => ({ items: [] }));
      await sb.upsert("catalog_channels", (info.items || []).map((c) => ({ channel_id: c.id, title: c.snippet.title, uploads: c.contentDetails.relatedPlaylists.uploads, status: "new", next_page: null })));
    }
  }
  return { q, added: keep.length, films: keep.map((k) => ({ id: k.id, title: k.title, cat: k.cat })) };
}


// Admin "add by link": paste YouTube links and they go straight into the catalogue (no AI-in-the-title check: the admin chose them).
// The channel is followed too, so its other episodes and films come in with the hourly importer. About 2 quota units.
export async function addByLinks(text) {
  const ids = [...new Set([...String(text || "").matchAll(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/g)].map((m) => m[1]))].slice(0, 50);
  if (!ids.length) return { error: "No YouTube links found" };
  const sb = db();
  const det = await yt("videos", { part: "snippet,contentDetails,status,statistics", id: ids.join(",") });
  const keep = [], chans = {};
  for (const d of det.items || []) {
    if (!d.status?.embeddable || d.status?.privacyStatus !== "public") continue;
    const sn = d.snippet, secs = iso(d.contentDetails.duration);
    const c = classify(sn.title, sn.description || "", true) || { cat: "original", char: "Drama", lore: "lore" };
    keep.push({
      id: "yt-" + d.id, platform: "YouTube", video_id: d.id, title: sn.title.slice(0, 200), channel: sn.channelTitle, channel_id: sn.channelId,
      cat: c.cat, char: c.char, lore: c.lore, format: secs <= 75 ? "short" : "film", duration: secs,
      views: +(d.statistics?.viewCount || 0), published_at: sn.publishedAt, age_restricted: d.contentDetails?.contentRating?.ytRating === "ytAgeRestricted",
    });
    chans[sn.channelId] = true;
  }
  if (keep.length) await sb.upsert("catalog", keep.map((k) => ({ ...k, hidden: false })));
  const cids = Object.keys(chans);
  if (cids.length) {
    const known = new Set((await sb.get(`catalog_channels?select=channel_id&channel_id=in.(${cids.join(",")})`)).map((c) => c.channel_id));
    const fresh = cids.filter((id) => !known.has(id));
    if (fresh.length) {
      const info = await yt("channels", { part: "contentDetails,snippet", id: fresh.join(",") }).catch(() => ({ items: [] }));
      await sb.upsert("catalog_channels", (info.items || []).map((c) => ({ channel_id: c.id, title: c.snippet.title, uploads: c.contentDetails.relatedPlaylists.uploads, status: "reading", next_page: null })));
    }
  }
  const skipped = ids.length - keep.length;
  return { added: keep.length, skipped, films: keep.map((k) => ({ id: k.id, title: k.title, cat: k.cat })) };
}
