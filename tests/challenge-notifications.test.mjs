import test from "node:test";
import assert from "node:assert/strict";
import { notesFor } from "../netlify/functions/paid-requests.mjs";
const D = 864e5, now = Date.now();
const open = { id: "a", title: "Vikings", by: "req", byName: "Mo", created: now - 8 * D, pledges: { req: { cents: 500 }, fan: { cents: 200 } },
  apps: { ch1: { uid: "cr1", name: "Fifth", at: now - 7.5 * D }, ch2: { uid: "cr2", name: "Sora", at: now - 7 * D } }, votes: { fan: "ch1" } };
const asked = { id: "b", title: "Batman", by: "fan", byName: "Fan", created: now - D, pledges: { fan: { cents: 500 } }, apps: {}, votes: {}, for: { channel: "x", uid: "cr1", name: "Fifth" } };
const kinds = (u) => notesFor([open, asked], u).map((n) => n.kind);
test("winner, losing creator and backers hear the result", () => {
  assert.ok(kinds("cr1").includes("won"));
  assert.ok(kinds("cr2").includes("lost"));
  assert.ok(kinds("fan").includes("winner"));
});
test("a chosen creator hears they were asked", () => assert.ok(kinds("cr1").includes("asked")));
test("strangers get nothing", () => assert.deepEqual(kinds("nobody"), []));
test("future events are not shown yet", () => {
  const fresh = { ...open, created: now - D };
  assert.ok(!notesFor([fresh], "fan").some((n) => n.kind === "vote"));
});
