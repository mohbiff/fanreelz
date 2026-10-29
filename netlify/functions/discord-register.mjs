// Registers the Fanreelz slash commands with Discord. Open https://fanreelz.com/api/discord-register once after setup
// (and again if the commands change). It only ever writes this fixed list, so calling it again does no harm.
// Needs in Netlify: DISCORD_APP_ID and DISCORD_BOT_TOKEN (secret).
const cat = (description) => ({ type: 3, name: "category", description, required: false, autocomplete: true });
// leave both empty for all AI fan films
const topic = [cat("A game, series, movie, anime or cartoon (empty = everything)"), { type: 3, name: "character", description: "Only films about this character, e.g. Goku or Arthas", required: false, max_length: 40, autocomplete: true }];
const everywhere = { integration_types: [0, 1], contexts: [0, 1, 2] }; // servers, DMs and as a personal app
const COMMANDS = [
  { name: "top", description: "The 5 most watched AI fan films", options: [cat("Game, anime, book or series")], ...everywhere },
  { name: "random", description: "A random AI fan film to watch", options: [cat("Game, anime, book or series")], ...everywhere },
  { name: "search", description: "Find AI fan films", options: [{ type: 3, name: "query", description: "What to look for, e.g. Arthas", required: true }], ...everywhere },
  { name: "showdown", description: "Who would win? The hottest Character Showdown", ...everywhere },
  { name: "today", description: "Today's AI video of the day", options: [topic[0], topic[1]], ...everywhere },
  { name: "daily", description: "Post a popular AI video in this channel every day", default_member_permissions: "32", integration_types: [0], contexts: [0],
    options: [topic[0], topic[1], { type: 3, name: "mode", description: "Turn it on (default) or off in this channel", required: false, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }] },
  { name: "fanreelz", description: "What the Fanreelz bot can do", ...everywhere },
];

export default async () => {
  const app = Netlify.env.get("DISCORD_APP_ID"), token = Netlify.env.get("DISCORD_BOT_TOKEN");
  if (!app || !token) return new Response("Add DISCORD_APP_ID and DISCORD_BOT_TOKEN in Netlify first.", { status: 500 });
  const r = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
    method: "PUT", headers: { Authorization: "Bot " + token, "Content-Type": "application/json" }, body: JSON.stringify(COMMANDS),
  });
  const text = await r.text();
  return new Response(r.ok ? `Done: ${COMMANDS.length} commands registered (/top, /random, /search, /showdown, /today, /daily, /fanreelz). They can take a minute to show up in Discord.` : `Discord said ${r.status}: ${text.slice(0, 400)}`, { status: r.ok ? 200 : 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
export const config = { path: "/api/discord-register" };
