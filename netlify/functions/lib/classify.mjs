// Fanreelz: decides whether a YouTube video is an AI fan film, and which world and character it belongs to.
// Shared by the importer; kept free of network code so it can be tested on its own.
import CATS from "./catmap.mjs";

// Words that show a video is AI-made.
export const AI_RE = /(\bai\b|\ba\.i\.|artificial intelligence|\bsora\b|\bveo ?[23]?\b|\bkling\b|\brunway\b|midjourney|hailuo|minimax|\bpika\b|seedance|\bluma\b|\bwan ?2|higgsfield|super panavision|panavision 70|80'?s dark fantasy|1980'?s dark fantasy|1950'?s|ai[- ]generated|aigenerated|ذكاء\s*(ال)?اصطناعي|بالذكاء)/i;
// Words that show it is a film, trailer, story or series rather than a tutorial or news.
export const FILM_RE = /(فيلم|مسلسل|حلقة|واقعي|كرتون|film|movie|cinema|cinematic|trailer|teaser|short|story|episode|\bep\.? ?\d|series|live[- ]action|in real life|reimagined|re-imagined|as an? \d0'?s|panavision|dark fantasy|parody|saga|chapter|part \d|music video)/i;
// Things that are not fan films.
export const BLOCK_RE = /(tutorial|how to|how i made|prompt(s)? (guide|tips)|course|explained|react(s|ing|ion|ions)?\b|review|news|podcast|livestream|\blive stream\b|stream highlights|top \d+|ranking|tier list|unboxing|speedrun|gameplay|walkthrough|\b[1-4]v[1-4]\b|ranked|outplayed|road to (gc|ssl|grand champ)|patch notes|nsfw|18\+|onlyfans|hentai|gore|sexy|bikini|\bhot\b|deepfake|starring [A-Z][a-z]+ [A-Z])/i;

// Extra names that point to a category (the category's own name and characters are added automatically).
const ALIASES = {
  dota2: ["dota"], lol: ["league of legends", "runeterra", "wild rift"], arcane: ["arcane", "piltover", "zaun"],
  eldenring: ["elden ring", "tarnished"], wh40k: ["warhammer 40", "40k", "40,000", "space marine", "adeptus", "astartes", "imperium of man", "horus heresy", "grey knights", "sisters of battle", "night lords", "drukhari"],
  whfantasy: ["warhammer fantasy", "age of sigmar", "old world"], aoe2: ["age of empires"], gta6: ["gta 6", "gta vi ", "gta6", "gta vi:", "gta vi -"],
  gta: ["grand theft auto", "gta ", "vice city", "san andreas", "los santos"], minecraft: ["minecraft", "herobrine", "creeper"],
  roblox: ["roblox", "doors roblox"], wow: ["world of warcraft", "azeroth", "lich king", "wow "], wc3: ["warcraft", "arthas", "frostmourne"],
  elderscrolls: ["elder scrolls", "skyrim", "oblivion", "morrowind", "dovahkiin"], zelda: ["zelda", "hyrule", "ocarina", "majora", "tears of the kingdom", "breath of the wild"],
  fallout: ["fallout", "vault-tec", "vault boy", "wasteland"], darksouls: ["dark souls", "bloodborne", "sekiro", "demon's souls", "lordran"],
  diablo: ["diablo", "sanctuary"], starcraft: ["starcraft", "zerg", "protoss", "terran"], stalker: ["s.t.a.l.k.e.r", "stalker"],
  brainrot: ["brainrot", "tralalero", "tung tung", "bombardiro", "ballerina cappuccina", "lirili", "brr brr patapim"],
  lotr: ["lord of the rings", "middle-earth", "middle earth", "hobbit", "gandalf", "frodo", "sauron", "mordor", "fellowship of the ring", "rings of power"],
  dune: ["dune", "arrakis", "atreides", "harkonnen"], witcher: ["witcher", "geralt", "rivia"], onepiece: ["one piece", "luffy", "straw hat"],
  naruto: ["naruto", "sasuke", "madara", "itachi", "konoha", "boruto"], berserk: ["berserk", "guts", "griffith"], frieren: ["frieren"],
  dragonball: ["dragon ball", "dbz", "goku", "vegeta", "frieza", "super saiyan"], dnd: ["dungeons & dragons", "dungeons and dragons", "d&d", "baldur's gate", "planescape"],
  pathfinder: ["pathfinder"], got: ["game of thrones", "house of the dragon", "westeros", "targaryen", "daenerys", "jon snow"],
  mtg: ["magic the gathering", "magic: the gathering", "planeswalker"], hearthstone: ["hearthstone"],
  pokemon: ["pokemon", "pokémon", "pikachu", "charizard", "mewtwo"], fortnite: ["fortnite", "jonesy", "peely", "battle bus", "tilted towers"],
  rocketleague: ["rocket league", "rocketleague"],
  rdr: ["red dead", "arthur morgan", "john marston", "dutch van der linde"],
  tlou: ["the last of us", "last of us", "joel and ellie"],
  gow: ["god of war", "kratos", "atreus"],
  mgs: ["metal gear", "solid snake", "big boss"],
  masseffect: ["mass effect", "commander shepard", "garrus"],
  uncharted: ["uncharted", "nathan drake"],
  finalfantasy: ["final fantasy", "sephiroth", "cloud strife", "tidus", "midgar"],
  halflife: ["half-life", "half life", "gordon freeman", "city 17", "glados", "aperture science", "portal 2"],
  silenthill: ["silent hill", "pyramid head"],
  residentevil: ["resident evil", "raccoon city", "leon kennedy", "leon s. kennedy"],
  tsushima: ["ghost of tsushima", "ghost of yotei", "jin sakai"],
  persona: ["persona 5", "persona 4", "persona 3", "phantom thieves"],
  mario: ["super mario", "mario bros", "mario", "bowser", "princess peach", "luigi"],
  monkeyisland: ["monkey island", "guybrush", "lechuck"],
  castlevania: ["castlevania", "alucard", "belmont"],
  detroit: ["detroit become human", "detroit: become human"],
  bioshock: ["bioshock", "big daddy", "andrew ryan"],
  assassins: ["assassin's creed", "assassins creed", "ezio auditore", "altair"],
  dragonage: ["dragon age", "ferelden", "grey warden"],
  maxpayne: ["max payne"],
  kingdomhearts: ["kingdom hearts"],
  deusex: ["deus ex", "adam jensen"],
  horizon: ["horizon zero dawn", "horizon forbidden west", "aloy"],
  cod: ["call of duty", "modern warfare", "captain price"],
  metroid: ["metroid", "samus"],
  yakuza: ["kazuma kiryu", "yakuza 0", "yakuza: like a dragon", "majima"],
  colossus: ["shadow of the colossus"],
  conan: ["future boy conan", "mirai shonen conan", "mirai shōnen conan", "未来少年コナン", "عدنان ولينا", "عدنان و لينا", "adnan and lina", "adnan & lina"],
  amongus: ["among us"],
  clash: ["clash of clans", "clash royale", "hog rider"],
  brawlstars: ["brawl stars"],
  subway: ["subway surfers"],
  fallguys: ["fall guys", "stumble guys"],
  pubg: ["pubg", "battlegrounds"],
  freefire: ["free fire", "freefire"],
  honorofkings: ["honor of kings", "arena of valor"],
  mlbb: ["mobile legends", "mlbb", "land of dawn"],
  cs: ["counter-strike", "counter strike", "cs2", "cs:go", "csgo", "dust 2", "dust2"],
  valorant: ["valorant"],
  apex: ["apex legends"],
  overwatch: ["overwatch", "widowmaker", "d.va"],
  rainbow6: ["rainbow six", "rainbow 6", "r6 siege"],
  marvelrivals: ["marvel rivals"],
  genshin: ["genshin", "teyvat", "paimon"],
  starrail: ["honkai", "star rail"],
  eafc: ["ea fc", "ea sports fc", "fc 26", "fc 25"],
  destiny: ["destiny 2", "destiny the game"],
  dbd: ["dead by daylight"],
  sims: ["the sims", "sims 4", "sims 2", "simlish", "plumbob"],
  poe: ["path of exile", "wraeclast"],
  helldivers: ["helldivers", "super earth"],
  ark: ["ark survival", "ark: survival"],
  terraria: ["terraria"],
  stardew: ["stardew valley", "stardew"],
  monsterhunter: ["monster hunter", "rathalos"],
  wukong: ["black myth", "wukong"],
  myth: ["mythology", "zeus", "odin", "thor ", "anubis", "olympus", "valhalla", "greek gods", "norse gods"],
  whatif: ["harry potter", "hogwarts", "rick and morty", "simpsons", "star wars", "jedi", "darth", "marvel", "avengers", "batman", "spider-man", "spiderman", "lego", "barbie", "shrek", "toy story", "disney", "pixar"],
};
const WHATIF_CHAR = [["harry potter", "Harry Potter"], ["hogwarts", "Harry Potter"], ["rick and morty", "Rick and Morty"]];
// Categories that must not swallow a more specific one (gta vs gta6, wc3 vs wow).
const ORDER = ["gta6", "wow", "arcane", "whfantasy", "witchertv", "gow", "assassins", "kingdomhearts", "halflife", "residentevil", "marvelrivals", "wukong"];

const norm = (t) => " " + String(t || "").toLowerCase().replace(/[’']/g, "'") + " ";
const RULES = CATS.filter((c) => !["top", "trending", "all", "aiseries", "original"].includes(c.id) && !/^fx\d/.test(c.id))
  .map((c) => ({ ...c, keys: [...new Set([c.name.toLowerCase(), ...(ALIASES[c.id] || [])])] }))
  .sort((a, b) => (ORDER.includes(b.id) ? 1 : 0) - (ORDER.includes(a.id) ? 1 : 0));

export function classify(title, description = "", channelIsAi = false) {
  const t = norm(title), all = norm(title + " " + description.slice(0, 600));
  if (BLOCK_RE.test(title)) return null;
  const ai = AI_RE.test(title) || AI_RE.test(description.slice(0, 600)) || channelIsAi;
  if (!ai) return null;
  if (!FILM_RE.test(t) && !AI_RE.test(title)) return null;
  for (const c of RULES) {
    if (c.keys.some((k) => t.includes(k.length < 5 ? " " + k.trim() + " " : k))) {
      let char = c.chars.find((ch) => t.includes(ch.toLowerCase())) || "";
      if (c.id === "whatif") char = (WHATIF_CHAR.find(([k]) => t.includes(k)) || [, "Film remakes"])[1];
      if (!char) char = c.chars[c.chars.length - 1] || c.name;
      const lore = /panavision|as an? \d0'?s|what if|reimagined|re-imagined|parody|lego|pixar|in the style/i.test(title) || c.id === "whatif" ? "whatif" : "lore";
      return { cat: c.id, char, lore };
    }
  }
  // Arabic-language AI films and cartoons that name no franchise get their own shelf
  if (/[\u0600-\u06FF]/.test(title)) {
    const char = /مصري|مصرية|egypt/i.test(all) ? "Egyptian" : /عراقي|بلعراقي|iraq/i.test(all) ? "Iraqi" : /خليجي|سعودي|اماراتي|إماراتي|كويتي|gulf|saudi|emirat/i.test(all) ? "Gulf" : /سوري|لبناني|شامي|فلسطيني|اردني|أردني/i.test(all) ? "Levant" : /خيال علمي|sci-?fi|robot|روبوت/i.test(all) ? "Sci-fi" : "Gulf";
    return { cat: "arabic", char, lore: "lore" };
  }
  // An AI series episode that names no franchise (a dating show, a sitcom, an original drama): AI series.
  if (/\b(episode|ep\.? ?\d|s\d{1,2} ?e\d{1,3}|season \d|part \d|chapter \d|web series|mini.?series)\b/i.test(title)) {
    const char = /love island|dating|reality|bachelor|island/i.test(all) ? "Reality" : /comedy|sitcom|funny|brainrot/i.test(all) ? "Comedy" : "Drama";
    return { cat: "aiseries", char, lore: "lore" };
  }
  // An AI short film that names no franchise: an original world.
  if (/(ai|a\.i\.) (short )?film|short film|ai movie|ai cinematic|veo ?3|sora|kling|seedance/i.test(title) && FILM_RE.test(t)) {
    const char = /horror|haunt|ghost|demon|nightmare/i.test(all) ? "Horror" : /space|robot|alien|future|cyber|android|planet|sci-?fi/i.test(all) ? "Sci-fi" : /dragon|magic|kingdom|knight|wizard|fantasy|myth/i.test(all) ? "Fantasy" : "Drama";
    return { cat: "original", char, lore: "lore" };
  }
  return null;
}

export const CAT_IDS = new Set(CATS.map((c) => c.id));
