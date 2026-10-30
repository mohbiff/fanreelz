# Community safety

Reports, block lists and moderation decisions are stored by `/api/safety` in the existing `import_state` table. This table has RLS enabled with no public policies. No schema changes or extra client privileges are needed. The service key stays in the server environment; authenticated identity comes from Supabase Auth, and moderator access uses the existing `ADMIN_EMAILS` check.

- Film menus, comments, live messages and member profiles can send reports. A success message appears only after storage succeeds.
- Accounts → Reports shows a private review queue. Moderators can hide content, dismiss a report or restore hidden content. Hiding preserves the original comment and survives reloads or stale comment-document writes.
- Blocking hides a member's comments, live messages, submissions, requests and profile content for the blocking account. Unblock from the member's profile. It does not make public pages private or ban the other account.
- Direct admin comment hiding can be undone under Reports → Hidden comments. Safety visibility updates every 30 seconds while the page is visible, and immediately for the moderator after a change.
- Only content identifiers are returned by the public safety-state endpoint. Original content in existing public document rows is not erased by hiding. If removal at the storage/API level is required, an administrator must remove the original record as well.
- Reports are not automatically moderated. An administrator must regularly open the queue. Email remains the fallback for urgent and removal requests.

For an account-erasure request, review the `safety:block:<user-id>:` keys and report records whose `reporter` or `target.owner` references that account. These private records are separate from the Auth user row and are not removed by its existing cascade.

Validation: `node --test tests/safety.test.mjs tests/growth.test.mjs`.

Keep the Play Console controls accurate for the deployed version. This change does not establish suitability for children under 13, and does not change the app's 13+ terms.
