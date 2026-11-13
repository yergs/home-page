import { assertEquals } from "@std/assert";
import {
  decodeMarks,
  encodeMarks,
  itemsToShow,
  markAllUnread,
  markRead,
  markUnread,
  maxRemembered,
  readCount,
} from "./read-marks.ts";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

Deno.test("marks round-trip through their saved text, and bad text is no marks", () => {
  assertEquals(decodeMarks(encodeMarks(["a", "b"])), ["a", "b"]);
  assertEquals(decodeMarks(null), []);
  assertEquals(decodeMarks("not json"), []);
  assertEquals(decodeMarks('{"a":1}'), []);
  assertEquals(decodeMarks("[1,2]"), []);
});

Deno.test("markRead adds once, and keeps only the most recent marks", () => {
  assertEquals(markRead(["a"], "b"), ["a", "b"]);
  assertEquals(markRead(["a", "b"], "a"), ["a", "b"]);
  const many = Array.from({ length: maxRemembered }, (_, i) => `id${i}`);
  const more = markRead(many, "new");
  assertEquals([more.length, more.at(0), more.at(-1)], [maxRemembered, "id1", "new"]);
});

Deno.test("markUnread and markAllUnread take marks away", () => {
  assertEquals(markUnread(["a", "b"], "a"), ["b"]);
  assertEquals(markUnread(["a"], "zzz"), ["a"]);
  assertEquals(markAllUnread(["a", "b", "x"], ["a", "b", "c"]), ["x"]);
});

Deno.test("itemsToShow hides read items unless asked to show them, keeping the feed's order", () => {
  assertEquals(itemsToShow(items, ["b"], false).map((i) => i.id), ["a", "c"]);
  assertEquals(itemsToShow(items, ["b"], true).map((i) => i.id), ["a", "b", "c"]);
  assertEquals(itemsToShow(items, [], false), items);
});

Deno.test("readCount counts only the marked items still in the feed", () => {
  assertEquals(readCount(items, ["b", "gone"]), 1);
  assertEquals(readCount(items, []), 0);
});
