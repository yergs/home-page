import { assertEquals } from "@std/assert";
import { blankDraft, checkDraft, draftOf, withStudent } from "./edit.ts";
import type { Teacher } from "./teachers.ts";

const student = {
  name: "Ann",
  address: "1 Main St Denver CO 80000",
  days: ["Mon" as const, "Thu" as const],
  classes: [
    { day: "Mon" as const, start: 16 * 60 + 15, end: 16 * 60 + 45 },
    { day: "Thu" as const, start: null, end: null },
  ],
};

Deno.test("draftOf writes each class's times out, and a draft checks back into the student", () => {
  const draft = draftOf(student, student.classes);
  assertEquals(draft.classes, [
    { day: "Mon", start: "4:15 PM", end: "4:45 PM" },
    { day: "Thu", start: "", end: "" },
  ]);
  assertEquals(checkDraft(draft), { ok: true, student });
});

Deno.test("checkDraft tidies the student: spaces, week order from Sunday, repeats", () => {
  const checked = checkDraft({
    name: "  Ann   Example ",
    address: " 1 Main  St ",
    classes: [
      { day: "Sat", start: "10:00 AM", end: "10:30 AM" },
      { day: "Mon", start: "4:00 PM", end: "" },
      { day: "Sun", start: "", end: "" },
      { day: "Mon", start: "4:00 PM", end: "" },
    ],
  });
  assertEquals(
    checked.ok && [checked.student.name, checked.student.address, checked.student.days],
    [
      "Ann Example",
      "1 Main St",
      ["Mon", "Sat", "Sun"],
    ],
  );
  assertEquals(checked.ok && checked.student.classes.map((c) => c.day), ["Sun", "Mon", "Sat"]);
});

Deno.test("checkDraft says what's wrong", () => {
  assertEquals(checkDraft({ name: " ", address: "", classes: [] }), {
    ok: false,
    problems: ["Enter a name.", "Add at least one class."],
  });
  assertEquals(
    checkDraft({
      ...blankDraft,
      name: "A",
      classes: [
        { day: "Tue", start: "soon", end: "" },
        { day: "Wed", start: "5:00 PM", end: "4:00 PM" },
      ],
    }),
    {
      ok: false,
      problems: ["Tue: write times like 4:15 PM.", "Wed: the class should end after it starts."],
    },
  );
});

const teacher = (students: Teacher["students"]): Teacher => ({
  id: 1,
  name: "Pat",
  text: "",
  milesText: "10",
  visible: true,
  shape: "circle",
  fileName: "x.txt",
  students,
  found: null,
});

Deno.test("withStudent replaces, adds or removes a student", () => {
  const other = { ...student, name: "Ben" };
  const t = teacher([student, other]);
  const renamed = { ...student, name: "Ann Two" };
  assertEquals(withStudent(t, 0, renamed).students.map((s) => s.name), ["Ann Two", "Ben"]);
  assertEquals(withStudent(t, null, renamed).students.map((s) => s.name), [
    "Ann",
    "Ben",
    "Ann Two",
  ]);
  assertEquals(withStudent(t, 0, null).students.map((s) => s.name), ["Ben"]);
  assertEquals(withStudent(t, null, null), t);
  assertEquals(withStudent(t, 0, renamed).name, "Pat");
});
