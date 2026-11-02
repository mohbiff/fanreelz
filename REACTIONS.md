# Film reactions

Fans can select and remove multiple independent reactions: Epic, Impressive, Funny, Moving and Visually stunning. They are feelings, not numeric scores or genres.

Signed-in selections use the existing owner-protected docs/save_doc path with col=reactions, id=user UUID, data={r:{filmId:[reactionIds]},t:timestamp}. Guests keep selections locally; signing in merges them into the account. Unknown or duplicate reaction IDs do not count.

Legacy ratings remain unchanged in col=ratings. They are never converted to reactions. Existing 4–5 star liked films stay in the library alongside newly reacted-to films.

Most appreciated uses unique reacting accounts per film, so selecting multiple emotions does not multiply a person's ranking vote. Individual chip counts and total reactions describe each selected feeling. Fan Battles start equally and continue to use their own head-to-head votes.

Database: docs_known_col now also permits reactions; existing RLS, owner checks, save_doc function and grants are unchanged. The change was applied and a rolled-back authenticated save/read plus denied cross-owner write were verified. Run node tests/reactions.test.cjs for logic checks.
