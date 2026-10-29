// Fanreelz: decides whether a YouTube video is an AI fan film, and which world and character it belongs to.
// Shared by the importer; kept free of network code so it can be tested on its own.
import CATS from "./catmap.mjs";

// Words that show a video is AI-made.
export const AI_RE = /(\bai\b|\ba\.i\.|artificial intelligence|\bsora\b|\bveo ?[23]?\b|\bkling\b|\brunway\b|midjourney|hailuo|minimax|\bpika\b|seedance|\bluma\b|\bwan ?2|higgsfield|super panavision|panavision 70|80'?s dark fantasy|1980'?s dark fantasy|1950'?s|ai[- ]generated|aigenerated|生成ai|ai生成|人工智能|inteligencia artificial|intelig[eê]ncia artificial|intelligence artificielle|künstliche intelligenz|yapay zeka|нейросет|(?:^|[\s(\[|#])ии(?=$|[\s)\]|,.!:])|(?:^|[\s(\[|#])(?:ia|ki)(?=$|[\s)\]|,.!:])|ذكاء\s*(ال)?اصطناعي|بالذكاء)/i;
// Words that show it is a film, trailer, story or series rather than a tutorial or news.
export const FILM_RE = /(película|pelicula|filme|cortometraje|cortometraggio|curta|court[- ]m[ée]trage|kurzfilm|фильм|мультфильм|сериал|映画|영화|电影|動画|动画|アニメ|애니|phim|หนัง|série|serie |episodio|episódio|エピソード|에피소드|odcinek|bölüm|فيلم|مسلسل|حلقة|واقعي|كرتون|film|movie|cinema|cinematic|trailer|teaser|short|story|episode|\bep\.? ?\d|series|live[- ]action|in real life|reimagined|re-imagined|as an? \d0'?s|panavision|dark fantasy|parody|saga|chapter|part \d|music video)/i;
// Things that are not fan films.
export const BLOCK_RE = /(tutorial|how to|how i made|prompt(s)? (guide|tips)|course|explained|react(s|ing|ion|ions)?\b|review|news|podcast|livestream|\blive stream\b|stream highlights|top \d+|ranking|tier list|unboxing|speedrun|gameplay|walkthrough|\b[1-4]v[1-4]\b|ranked|outplayed|road to (gc|ssl|grand champ)|patch notes|nsfw|18\+|onlyfans|hentai|gore|sexy|bikini|\bhot\b|deepfake|starring [A-Z][a-z]+ [A-Z]|voice ?chang(er|ing)|voice ?chat|voice ?lines?|voicemod|soundboard|troll(s|ing)?\b|prank|ai (voice|cover|song)s?\b)/i;
// AI voices, AI song covers and voice changers are not AI films: they don't make a channel an "AI channel"
export const VOICE_RE = /(ai ?voice|voice ?chang(er|ing)|voicemod|ai cover|ai song|soundboard|text to speech|\btts\b)/i;

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
  conan: ["future boy conan", "mirai shonen conan", "mirai shōnen conan", "未来少年コナン", "미래소년 코난", "futureboyconan", "عدنان ولينا", "عدنان و لينا", "adnan and lina", "adnan & lina"],
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
  tomsawyer: ["tom sawyer", "huckleberry finn", "huck finn", "توم سوير", "توم سوير", "トム・ソーヤー", "トムソーヤ", "톰 소여"],
  patmat: ["pat and mat", "pat & mat", "pat a mat", "pat und mat", "بات ومات", "بات و مات", "pat i mat"],
  myth: ["mythology", "zeus", "odin", "thor ", "anubis", "olympus", "valhalla", "greek gods", "norse gods"],
  mrbean: ["mr bean", "mr. bean", "mister bean", "rowan atkinson", "مستر بين", "ミスター・ビーン"],
  chaplin: ["chaplin", "the tramp", "شارلي شابلن", "شابلن"],
  laurelhardy: ["laurel and hardy", "laurel & hardy", "buster keaton", "three stooges", "silent comedy"],
  godfather: ["godfather", "corleone", "العراب"],
  scarface: ["scarface", "tony montana"],
  gangster: ["goodfellas", "pulp fiction", "sopranos", "peaky blinders", "thomas shelby", "tarantino", "taxi driver", "the irishman", "al capone"],
  breakingbad: ["breaking bad", "walter white", "heisenberg", "jesse pinkman", "better call saul", "saul goodman"],
  starwars: ["star wars", "jedi", "darth", "sith lord", "mandalorian", "skywalker", "yoda", "obi-wan", "stormtrooper", "grogu"],
  marvel: ["marvel", "avengers", "spider-man", "spiderman", "spider man", "iron man", "thanos", "x-men", "wolverine", "deadpool", "captain america", "hulk"],
  dc: ["batman", "superman", "the joker", "joker movie", "gotham", "justice league", "wonder woman", "the dark knight", " dc "],
  harrypotter: ["harry potter", "hogwarts", "voldemort", "hermione", "dumbledore", "wizarding world"],
  bond: ["james bond", "007"],
  scificlassics: ["terminator", "the matrix", "matrix", "xenomorph", "alien vs predator", "back to the future", "jurassic park", "jurassic world", "blade runner", "robocop", "predator"],
  adventure: ["indiana jones", "pirates of the caribbean", "jack sparrow", "titanic", "rocky balboa", "home alone", "kevin mccallister"],
  horrorclassics: ["dracula", "frankenstein", "freddy krueger", "nightmare on elm street", "friday the 13th", "jason voorhees", "pennywise", "michael myers", "the shining"],
  sitcoms: ["friends sitcom", "central perk", "seinfeld", "the office", "stranger things", "squid game", "sherlock holmes", "mr. robot", "twin peaks", "the twilight zone"],
  disney: ["disney", "pixar", "toy story", "frozen", "lion king", "aladdin", "mickey mouse", "little mermaid", "moana", "snow white", "cinderella", "beauty and the beast", "pinocchio", "winnie the pooh", "ديزني"],
  simpsons: ["simpsons", "homer simpson", "bart simpson", "springfield"],
  tomjerry: ["tom and jerry", "tom & jerry", "توم وجيري", "توم و جيري"],
  looney: ["looney tunes", "bugs bunny", "daffy duck", "road runner", "tweety"],
  spongebob: ["spongebob", "sponge bob", "bikini bottom", "سبونج بوب"],
  shrek: ["shrek", "dreamworks", "kung fu panda", "madagascar movie", "how to train your dragon"],
  eurocomics: ["tintin", "asterix", "obelix", "smurfs", "lucky luke", "gaston lagaffe"],
  scooby: ["scooby-doo", "scooby doo", "flintstones", "jetsons", "hanna-barbera"],
  ghibli: ["ghibli", "totoro", "spirited away", "princess mononoke", "howl's moving castle", "kiki's delivery"],
  sailormoon: ["sailor moon"],
  aot: ["attack on titan", "shingeki no kyojin", "eren yeager", "levi ackerman"],
  demonslayer: ["demon slayer", "kimetsu no yaiba", "tanjiro", "nezuko"],
  jjk: ["jujutsu kaisen", "gojo satoru", "satoru gojo", "sukuna"],
  deathnote: ["death note", "ryuk"],
  doraemon: ["doraemon", "nobita", "دورايمون"],
  tsubasa: ["captain tsubasa", "kapten tsubasa", "كابتن ماجد", "كابتن ماجد", "captain majed", "oliver and benji", "oliver y benji"],
  grendizer: ["grendizer", "goldorak", "جريندايزر", "غرندايزر", "mazinger"],
  pinkpanther: ["pink panther", "inspector clouseau", "النمر الوردي"],
  classictoons: ["popeye", "woody woodpecker", "betty boop", "pinky and the brain", "alvin and the chipmunks", "chipmunks", "casper the friendly ghost"],
  garfield: ["garfield", "snoopy", "charlie brown"],
  kidsclassics: ["pippi", "bamse", "moomin", "mumin", "barbapapa", "pingu", "teletubbies", "thomas the tank engine", "paw patrol", "peppa pig", "bluey"],
  heman: ["he-man", "he man", "skeletor", "she-ra", "masters of the universe"],
  transformers: ["transformers", "optimus prime", "megatron"],
  tmnt: ["ninja turtles", "tmnt", "shredder", "teenage mutant"],
  powerrangers: ["power rangers", "megazord"],
  thundercats: ["thundercats", "thunder cats", "mumm-ra"],
  captainplanet: ["captain planet", "planeteers"],
  ducktales: ["ducktales", "duck tales", "scrooge mcduck", "darkwing duck", "chip 'n dale", "gummi bears"],
  gadget: ["inspector gadget"],
  ghostbusters: ["ghostbusters", "ghost busters", "stay puft"],
  carebears: ["care bears", "my little pony", "strawberry shortcake"],
  godzilla: ["godzilla", "king kong", "kaiju", "monsterverse", "ゴジラ"],
  legends: ["robin hood", "king arthur", "excalibur", "camelot", "zorro", "tarzan", "sinbad", "1001 nights", "arabian nights", "ali baba", "السندباد", "سندباد", "علي بابا", "ألف ليلة"],
  comicheroes: ["spawn", "hellboy", "judge dredd", "conan the barbarian", "fantomen", "the phantom ghost who walks", "the phantom 1"],
  comedyclassics: ["monty python", "austin powers", "borat", "ace ventura", "jim carrey", "the mask"],
  familyclassics: ["willy wonka", "chocolate factory", "e.t. the extra", "e.t. ", "gremlins", "forrest gump", "the goonies", "the neverending story"],
  whatif: ["rick and morty", "lego", "barbie"],
};
const WHATIF_CHAR = [["rick and morty", "Rick and Morty"]];
// Categories that must not swallow a more specific one (gta vs gta6, wc3 vs wow).
const ORDER = ["ducktales", "pinkpanther", "tsubasa", "grendizer", "ghibli", "marvelrivals", "mrbean", "chaplin", "godfather", "scarface", "breakingbad", "starwars", "harrypotter", "disney", "simpsons", "tomjerry", "spongebob", "shrek", "gta6", "wow", "arcane", "whfantasy", "witchertv", "gow", "assassins", "kingdomhearts", "halflife", "residentevil", "marvelrivals", "wukong"];

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
  // An AI short film that names no franchise (in any language): an original world.
  if ((/(ai|a\.i\.) (short )?film|short film|ai movie|ai cinematic|veo ?3|sora|kling|seedance/i.test(title) || AI_RE.test(title)) && FILM_RE.test(t)) {
    const char = /horror|haunt|ghost|demon|nightmare/i.test(all) ? "Horror" : /space|robot|alien|future|cyber|android|planet|sci-?fi/i.test(all) ? "Sci-fi" : /dragon|magic|kingdom|knight|wizard|fantasy|myth/i.test(all) ? "Fantasy" : "Drama";
    return { cat: "original", char, lore: "lore" };
  }
  return null;
}

export const CAT_IDS = new Set(CATS.map((c) => c.id));
