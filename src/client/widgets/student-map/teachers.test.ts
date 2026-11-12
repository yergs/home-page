import { assertEquals } from "@std/assert";
import {
  blankTeacher,
  fromStudentId,
  placeOf,
  prospectBase,
  studentId,
  withRolls,
} from "./teachers.ts";

const student = { name: "Ann", address: "", days: ["Mon" as const], classes: [] };
const rolls = [
  { teacher: "Pat", students: [student] },
  { teacher: "Sam", students: [student, { ...student, name: "Ben" }] },
];

Deno.test("each teacher in a file is added with the next id and a shape not yet used", () => {
  const added = withRolls([], rolls, "all.txt");
  assertEquals(
    added.map((t) => [t.id, t.name, t.shape, t.visible, t.fileName, t.students.length]),
    [
      [0, "Pat", "circle", true, "all.txt", 1],
      [1, "Sam", "square", true, "all.txt", 2],
    ],
  );
});

Deno.test("loading the file again updates students and keeps each teacher's settings", () => {
  const first = withRolls([], rolls, "all.txt");
  const edited = first.map((t) =>
    t.name === "Pat" ? { ...t, text: "1 Main St", milesText: "7", visible: false } : t
  );
  const again = withRolls(edited, [{ teacher: "pat ", students: [] }, {
    teacher: "Cy",
    students: [student],
  }], "new.txt");
  assertEquals(
    again.map((t) => [t.id, t.name, t.text, t.milesText, t.visible, t.fileName, t.students.length]),
    [
      [0, "Pat", "1 Main St", "7", false, "new.txt", 0],
      // Not in the new file: left as it was.
      [1, "Sam", "", "10", true, "all.txt", 2],
      [2, "Cy", "", "10", true, "new.txt", 1],
    ],
  );
  assertEquals(again.at(2)?.shape, "triangle");
});

Deno.test("student ids are unique across teachers and below the new families'", () => {
  assertEquals(studentId(2, 5), 20005);
  assertEquals(fromStudentId(studentId(7, 123)), { teacherId: 7, index: 123 });
  assertEquals(studentId(99, 9999) < prospectBase, true);
});

Deno.test("a teacher added by hand has no students, the next id and an unused shape", () => {
  const [pat] = withRolls([], rolls, "all.txt");
  const blank = blankTeacher(pat === undefined ? [] : [pat]);
  assertEquals([blank.id, blank.name, blank.students, blank.shape, blank.visible], [
    1,
    "",
    [],
    "square",
    true,
  ]);
  assertEquals(blankTeacher([]).id, 0);
});

Deno.test("placeOf gives where the address was found, only while the address is unchanged", () => {
  const [pat] = withRolls([], rolls, "all.txt");
  const base = pat === undefined ? blankTeacher([]) : pat;
  const found = {
    ...base,
    text: "1 Main St",
    found: { text: "1 Main St", lat: 40, lon: -105, label: "1 MAIN ST" },
  };
  assertEquals(placeOf(found), { at: { lat: 40, lon: -105 }, label: "1 MAIN ST" });
  assertEquals(placeOf({ ...found, text: " 1 Main St " }), {
    at: { lat: 40, lon: -105 },
    label: "1 MAIN ST",
  });
  assertEquals(placeOf({ ...found, text: "2 Oak Ave" }), null);
  assertEquals(placeOf(base), null);
});
