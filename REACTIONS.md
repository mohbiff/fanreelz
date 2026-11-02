# Film reactions

Fans can choose up to two feelings per video: Epic, Impressive, Funny, Moving and Informative. These are not numeric ratings. Legacy star ratings remain stored separately and prior liked films stay in the library.

## Browse filters

Reaction controls filter the current page in place: Home, world groups, individual categories and characters, search, Films, Shorts and Series tabs, Browse, and creator video tabs. They keep the current world, format, search and page route. Counters use the current context before applying the reaction choice, so an unrelated world's videos cannot appear. A series matches when at least one episode satisfies the filter.

Clicking a feeling once matches it in first place (the most-voted reaction). Clicking again activates ×2 and matches it in second place. A third click removes it. The other position is unrestricted unless explicitly filtered. Combined filters use AND. Two first-place selections produce guidance to click one again for ×2; only one feeling can select second place.

Each feeling has an explanation pop-up, dismissed by Close, outside click or Escape. Filters never add or double votes. The five reaction types all support the same cycle. Tied counts use the displayed reaction order deterministically.

The current route stores with=epic,informative and second=informative when active, preserving format and world parameters for reload/share/back. The optional /reactions page also supports g, cat and char. There is no preset-combinations gallery.

## Storage and ranking

Signed-in choices use owner-protected docs/save_doc with col=reactions, id=user UUID, data={r:{filmId:[reactionIds]},t:timestamp}. Guests save locally and merge on sign-in. Unknown and duplicate IDs do not count. The database docs_reaction_limit constraint independently limits arrays to two. Existing RLS and grants are unchanged.

Most appreciated counts each reacting account once per video. Discovery examines the highest and second-highest positive per-feeling vote counts. Informative uses its own informative ID; retired visual votes are never reinterpreted as educational votes.

## Validation

Run node tests/reactions.test.cjs and node --test tests/navigation.test.mjs. Tests cover storage limits, rollback, guest isolation, exact rank filters and cycles for all five feelings, world/category/character scoping, inline feed and format filtering, shareable route round-trips and native navigation behavior.
