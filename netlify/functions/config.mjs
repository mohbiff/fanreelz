// Fanreelz: public settings the page needs to talk to Supabase (sign-in and database).
// The anon key is designed to be public; the database's row-level security decides what it may do.
// Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify → Project configuration → Environment variables.
export default async () =>
  new Response(JSON.stringify({
    supabaseUrl: Netlify.env.get("SUPABASE_URL") || "",
    supabaseAnonKey: Netlify.env.get("SUPABASE_ANON_KEY") || "",
    discordAppId: Netlify.env.get("DISCORD_APP_ID") || "", // public: the bot's install link uses it
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600",
    },
  });

export const config = { path: "/api/config" };
