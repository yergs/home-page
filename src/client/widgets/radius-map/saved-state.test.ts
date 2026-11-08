import { assertEquals } from "@std/assert";
import { decodeState, emptyState, encodeState, type SavedState } from "./saved-state.ts";

const state: SavedState = {
  csv: { fileName: "leads.csv", headers: ["Name", "Street"], rows: [["Ann", "1 Main St"]] },
  mapping: { name: 0, street: 1, city: null, state: null, zip: null },
  starts: [{ id: 3, name: "Bo", text: "2 Oak Ave", milesText: "12" }],
};

Deno.test("saved state round-trips through its stored text", () => {
  assertEquals(decodeState(encodeState(state)), state);
});

Deno.test("nothing stored, or something unreadable, starts fresh", () => {
  assertEquals(decodeState(null), emptyState);
  assertEquals(decodeState("not json"), emptyState);
  assertEquals(decodeState('{"csv":5}'), emptyState);
});

Deno.test("a mapping that points past the CSV's columns is dropped, keeping the rest", () => {
  const bad = { ...state, mapping: { name: 0, street: 7, city: null, state: null, zip: null } };
  assertEquals(decodeState(encodeState(bad)), { ...state, mapping: null });
});
