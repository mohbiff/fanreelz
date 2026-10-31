# YouTube submissions

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
