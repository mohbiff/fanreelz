# YouTube submissions

## Import a whole channel (admins)

Open **Accounts (admin) → New videos → Import YouTube channel**. Paste an
`https://www.youtube.com/@Handle`, `/channel/UC…`, or legacy `/user/…` link,
then press **Import channel**. The same form appears below the homepage admin
search bar. It is only displayed to admins; the server also requires admin access.

The first batch runs immediately. Cloudflare's existing ten-minute importer
schedule continues one page (up to 50 uploads) per run, saves its cursor privately
in `import_state`, and checks finished channels again after six hours. A full
rescan refreshes metadata and finds new uploads, using stable YouTube video IDs
to avoid duplicate catalogue entries. All public embeddable videos are imported,
including titles without AI keywords. Hidden videos stay hidden, and Hide channel
disables this channel's automatic import. No schema changes or new secrets.

The result message reports uploads checked, videos saved in the current batch,
and whether more batches remain. Import counts include refreshed existing videos.
API failures keep the cursor for retry. Imports are not a copy or re-upload of
video files: playback uses the original YouTube embed.

## Individual video submissions

Cloudflare routes `POST /api/submit-youtube` to the shared server handler.
It validates the signed-in account with Supabase Auth, reads YouTube's video
snippet, and saves `channelTitle` and `channelId` on the existing submission
JSON. Public creator labels use the channel name. YouTube submission records
no longer map the submitting account to the public `byId` creator field.

No schema migration or new secrets are required. The handler uses the existing
Cloudflare settings `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. The existing `save_doc` RPC runs with the user's
token, retaining its ownership checks. Other platforms keep their existing flow.

The existing document owner remains the ownership/moderation counterpart for
older data. As before, shared docs and their owner IDs can be read through the
Data API; this change does not alter that existing access model. The added
`submittedBy` audit is stored separately in `import_state`, which has RLS and
no public policies. Admin `activity` responses include these audit records.
An audit entry is a submission attempt: it is written before the public save,
so a later save failure can leave an audit entry without a published film.

Older YouTube submissions without metadata remain readable and display
"YouTube creator" rather than the submitter. They are not bulk backfilled.
Episodes with metadata are grouped by channel and series title, while older
series retain their document-owner grouping. Blocking/moderation still uses
the original document owner internally.

Validation: `node --test tests/*.test.mjs`. The submission test runs through the
Cloudflare route with mocked YouTube/Auth/storage responses, verifies saved
channel metadata and private submitter identity, preserves existing submissions,
and covers rejected authentication, invalid URLs, missing metadata, and API/audit
failures. A real signed-in production submit still requires a live user session
and the deployed Worker with its existing secrets.
