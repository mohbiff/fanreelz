# Creator Growth Center — Cloudflare

Implemented inside the existing Insights (Plus) route. Public navigation and existing section titles are preserved. All detailed feature data is protected by the existing server-side Plus/admin membership check. Search counts are now removed from non-admin API responses as well as hidden in the UI.

## Features and data

- Creator Insights: existing 30-day search topics, worlds and country signals.
- Trending Opportunities: increasing weekly search topics with Plan and Watch actions.
- AI Creator Assistant: existing authenticated assistant; configuration message now points to Cloudflare. Context includes topic names only, so private search counts are not disclosed through AI.
- Personal Performance Dashboard: explicit unavailable state. No verified account/channel ownership or private analytics integration exists in this schema; no fabricated metrics are displayed.
- Creator Rankings: eligible imported catalogue film count by channel, not views or growth. At most 20,000 records, clearly labelled if capped.
- Trend Alerts: saved watched topics matched against current weekly trending topics on Insights reload. No email, push or background notification integration.
- Creator Planning Calendar: account-private dated plans, manual planned/published state, deletion. No automatic publishing or external calendar sync.
- Global Audience Insights: platform search countries and topics, not channel audience demographics.
- Featured Creator: administrator selection by catalogue channel ID, validated against eligible catalogue records when displayed. No selection until an admin sets one.
- Content Gap Finder: topics where at least half of searches found no results; not proof that content does not exist.

## Storage and architecture

Uses existing `import_state` with RLS and service-role-only access: `growth:<authenticated-user-id>` for private plans/watch topics, `growth:featured` for editorial selection. No database migration or new table. Each save replaces that account's plans/watch list (last save wins across tabs). Invalid dates, sizes and states are rejected. Storage failures are visible; unavailable preference reads disable saving to avoid overwriting unseen plans.

Existing shared functions under `netlify/functions` are already imported by `worker/index.mjs`. This change uses that architecture; it does not deploy to Netlify or create a second backend. No new public endpoint or Worker binding is needed.

## Configuration and deployment remaining

Nothing has been pushed or deployed. Use the existing Cloudflare Worker deployment process from the repository root (normally `npx wrangler deploy` with the existing account and production configuration).

Confirm the existing Cloudflare settings: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`; AI also needs `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. Enter sensitive values directly in Cloudflare Workers & Pages → Fanreelz → Settings → Variables and Secrets as secrets. Never add them to source files or chat. Existing values were not inspected or changed.

Use existing admin Plus management to grant access. After deployment, sign in as an administrator to select a Featured Creator by its existing catalogue channel ID. Personal analytics still requires a separately designed verified channel ownership/OAuth integration. Email/push alerts and external calendar publishing are not configured or implemented.

## Validation

Run `node tests/growth.test.mjs` from any working directory. Mocked tests cover unauthenticated/Plus/admin access, private count omission, private per-account storage, invalid calendar dates, featured creator authorization, catalogue failure states, escaped UI output, and parsing all five executable inline scripts. Worker and changed modules also pass Node syntax checks; `git diff --check` passes.

Live Supabase, OpenAI, Cloudflare deployment and browser layout have not been tested. Search data uses the existing latest-20,000-event cap; catalogue rankings use a similar explicit cap. No personal analytics claims are made.
