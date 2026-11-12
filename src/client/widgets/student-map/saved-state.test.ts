import { assertEquals } from "@std/assert";
import { decodeState, emptyState, encodeState, type SavedState } from "./saved-state.ts";

const student = {
  name: "Ann",
  address: "1 Main St Denver CO 80000",
  days: ["Mon", "Wed"] as const,
  classes: [{ day: "Mon" as const, start: 960, end: 990 }, {
    day: "Wed" as const,
    start: null,
    end: null,
  }],
};

const state: SavedState = {
  teachers: [{
    id: 2,
    name: "Pat",
    text: "2 Oak Ave Denver CO 80000",
    milesText: "12",
    visible: false,
    shape: "star",
    fileName: "pat.txt",
    students: [{ ...student, days: [...student.days] }],
    found: { text: "2 Oak Ave Denver CO 80000", lat: 39.7, lon: -105, label: "2 OAK AVE" },
  }],
  prospects: [{ id: 4, name: "New Family", text: "3 Elm Way Denver CO 80000" }],
  hiddenDays: ["Fri"],
  lessonText: "45",
};

Deno.test("saved state round-trips through its stored text", () => {
  assertEquals(decodeState(encodeState(state)), state);
});

Deno.test("nothing stored, or something unreadable, starts fresh", () => {
  assertEquals(decodeState(null), emptyState);
  assertEquals(decodeState("not json"), emptyState);
  assertEquals(decodeState('{"report":5}'), emptyState);
});

Deno.test("a lesson length missing from an older save is 30 minutes", () => {
  const { lessonText: _, ...without } = state;
  assertEquals(decodeState(JSON.stringify(without)).lessonText, "30");
});

Deno.test("a save from when there was one teacher becomes a one-teacher save", () => {
  const old = JSON.stringify({
    fileName: "roll.txt",
    report: { teacher: "Roll Teacher", students: [{ name: "Old", address: "", days: ["Tue"] }] },
    teacher: { name: "", text: "4 Ash Dr Denver CO 80000", milesText: "8" },
    prospects: [{ id: 1, name: "P", text: "5 Fir Ct Denver CO 80000" }],
    hiddenDays: ["Sat"],
  });
  const decoded = decodeState(old);
  assertEquals(
    decoded.teachers.map((t) => [t.id, t.name, t.text, t.milesText, t.shape, t.visible]),
    [
      [0, "Roll Teacher", "4 Ash Dr Denver CO 80000", "8", "circle", true],
    ],
  );
  assertEquals(decoded.teachers.at(0)?.found, null);
  assertEquals(decoded.teachers.at(0)?.students, [
    { name: "Old", address: "", days: ["Tue"], classes: [] },
  ]);
  assertEquals([decoded.prospects.length, decoded.hiddenDays], [1, ["Sat"]]);
  const noRoll = decodeState(JSON.stringify({ ...JSON.parse(old), report: null }));
  assertEquals(noRoll.teachers, []);
});
