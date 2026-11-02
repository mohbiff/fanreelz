# Film reactions

Fans can select and remove up to two independent reactions: Epic, Impressive, Funny, Moving and Informative. They are feelings, not numeric scores or genres.

Signed-in selections use the existing owner-protected docs/save_doc path with col=reactions, id=user UUID, data={r:{filmId:[reactionIds]},t:timestamp}. Guests keep selections locally; signing in merges them into the account. Unknown or duplicate reaction IDs do not count.

Legacy ratings remain unchanged in col=ratings. They are never converted to reactions. Existing 4–5 star liked films stay in the library alongside newly reacted-to films.

Most appreciated uses unique reacting accounts per film, so selecting multiple emotions does not multiply a person's ranking vote. Individual chip counts and total reactions describe each selected feeling. Fan Battles start equally and continue to use their own head-to-head votes.

Database: docs_known_col now also permits reactions; existing RLS, owner checks, save_doc function and grants are unchanged. The change was applied and a rolled-back authenticated save/read plus denied cross-owner write were verified. Run node tests/reactions.test.cjs for logic checks.

## Reaction discovery

Browse by reaction is available from Home, Browse all and the side menu at /reactions. Five individual feelings and all ten unordered pairs are supported. Query parameter with=epic,moving selects both; format=film or format=short narrows the video format. Filtering uses AND across the leading reactions: each selected feeling must be among the video’s two most-voted reaction types. A video with only one positive reaction type has one leading feeling. Lower-voted types do not add extra discovery categories. Zero-count categories stay visible and fill automatically as people react. Each account still counts once per video in Most appreciated.

The client caps every film's selections at two, including guest merging. The database docs_reaction_limit CHECK independently rejects reaction maps containing non-array values or arrays longer than two; legacy ratings and other document collections are unaffected. Valid pair writes and rejected third-reaction writes were verified in a rolled-back authenticated transaction.

## Scoped browsing

Sidebar world-group headings are native links to the corresponding video feed (e.g. /?g=Popular%20games). Reaction links in a group, category or character preserve that scope. /reactions carries g, cat and char parameters; format changes, clearing feelings and reload/back navigation retain the scope. Both result videos and reaction counts are computed from the same scoped pool. The explicit Browse all videos link resets the scope. A mismatched group is corrected to the selected category's actual parent group.

The discovery page uses the five reaction buttons; there is no preset combination card gallery.

## Leading reaction categories

Discovery uses the two highest positive reaction counts per video, not every reaction it has ever received. A video with fewer than two positive types uses just those available. Equal vote counts use the displayed reaction order as a deterministic tie-break. Category counts and filtered results apply this same rule after the world-group/category/character scope. Live reaction updates recalculate the leading pair; each fan can still select up to two feelings independently.

## Informative

The fifth reaction is 💡 Informative (id: informative), for videos that teach, explain or share useful facts. It replaces the retired visual reaction. Existing visual votes are not reinterpreted as informative; no stored visual selections existed when this change was made. The two-reaction limit, scoped discovery and leading-reaction ranking are unchanged.
