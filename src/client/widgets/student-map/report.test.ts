import { assertEquals } from "@std/assert";
import { classesOf, parseRoll } from "./report.ts";

type Opts = {
  title: string;
  day: string;
  student: string;
  address: string;
  teacher: string;
  time: string;
  end: string;
};

// Made-up people, laid out as the export is: any number of teachers' classes in one file.
const block = (o: Opts) =>
  [
    `${o.title},Days:,${o.day}`,
    "Class:",
    "Location,XX,Rm:,,Dates:,1-Jan-25,-,",
    `Desc:,A note,Times:,${o.time},-,${o.end}`,
    "Category1,Piano Private",
    `Instructors:,"${o.teacher}, , , "`,
    "Age,,,,,,,,,,,,,,,,,",
    "#,Name,Gender,,,,,,,,,,,,,,,,,",
    `1,${o.student},8/F`,
    `Family Address: ${o.address}`,
    "Absences & Makeups",
    "Type,Date,Student Name,Age,Phone,Notes",
  ].join("\r\n");

const base: Opts = {
  title: ",Ann Example - piano IH",
  day: "Mon",
  student: "Ann Example",
  address: "1 Main Street Denver CO 80000",
  teacher: "Pat Teacher",
  time: "4:00 PM",
  end: "4:30 PM",
};
const four = 16 * 60;
const at = (
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri",
  start: number | null,
  end: number | null,
) => ({
  day,
  start,
  end,
});

const text = [
  "Date:,1/1/2026 9:00:00 AM,Class Roll,Page:,1",
  "Class:" + block(base),
  block({
    ...base,
    title: '"Ben Sample -piano,  IH"',
    day: "Thu",
    student: "Ben*OO Sample",
    address: "2 Oak Ave Aurora CO 80001",
  }),
  // Another teacher's class.
  block({
    ...base,
    title: ",Cy Test - Piano IH",
    day: "Tue",
    student: "Cy Test",
    address: "3 Elm Way Littleton CO 80002",
    teacher: "Sam Other",
  }),
  // A page header lands in the middle of a block, and lines around it come out swapped.
  [
    ",Di Page - Piano IH,Days:,Fri",
    "Desc:,A long note,Times:,6:00 PM,-,6:30 PM",
    "Date:,1/1/2026 9:00:00 AM,Class Roll,Page:,2",
    "A long note,Category2,",
    'Instructors:,"Sam Other, , , "',
    "#,Name,Gender,,,,,,,,,,,,,,,,,",
    "Date:,1/1/2026 9:00:00 AM,Class Roll,Page:,3",
    "1,Di Page,12/M",
    "Family Address: 4 Fir Ct Denver CO 80003",
  ].join("\r\n"),
  // Ann again with Pat, on Wednesday, with the address spelled a little differently.
  block({
    ...base,
    day: "Wed",
    address: "1 Main St. Denver CO 80000",
    time: "5:15 PM",
    end: "5:45 PM",
  }),
  // Ann is also a student of Sam's, a student with no address, and a class with no instructor.
  block({ ...base, title: ",Ann Example - voice", day: "Thu", teacher: "Sam Other" }),
  block({ ...base, title: ",Ed Nobody - piano IH", day: "Fri", student: "Ed Nobody", address: "" }),
  block({
    ...base,
    title: ",Fay Loose - piano IH",
    day: "Tue",
    student: "Fay Loose",
    teacher: " ",
  }),
].join("\r\n");

Deno.test("parseRoll splits one file into a roll for each teacher", () => {
  const rolls = parseRoll(text);
  assertEquals(rolls.map((r) => [r.teacher, r.students.map((s) => s.name)]), [
    ["", ["Fay Loose"]],
    ["Pat Teacher", ["Ann Example", "Ben Sample", "Ann Example", "Ed Nobody"]],
    ["Sam Other", ["Cy Test", "Di Page", "Ann Example"]],
  ]);
});

Deno.test("each student has their address, days and class times", () => {
  const pat = parseRoll(text).find((r) => r.teacher === "Pat Teacher")?.students ?? [];
  assertEquals(
    pat.map((s) => [s.name, s.address, s.days, s.classes]),
    [
      ["Ann Example", "1 Main Street Denver CO 80000", ["Mon"], [at("Mon", four, four + 30)]],
      ["Ben Sample", "2 Oak Ave Aurora CO 80001", ["Thu"], [at("Thu", four, four + 30)]],
      ["Ann Example", "1 Main St. Denver CO 80000", ["Wed"], [at("Wed", four + 75, four + 105)]],
      ["Ed Nobody", "", ["Fri"], [at("Fri", four, four + 30)]],
    ],
  );
});

Deno.test("a page break inside a class doesn't lose its teacher, time or student", () => {
  const sam = parseRoll(text).find((r) => r.teacher === "Sam Other")?.students ?? [];
  const di = sam.find((s) => s.name === "Di Page");
  assertEquals([di?.address, di?.classes], ["4 Fir Ct Denver CO 80003", [
    at("Fri", four + 120, four + 150),
  ]]);
});

Deno.test("one student in two classes with one teacher is one student with both", () => {
  const same = text.replace("1 Main St. Denver", "1 Main Street Denver");
  const pat = parseRoll(same).find((r) => r.teacher === "Pat Teacher")?.students ?? [];
  const ann = pat.filter((s) => s.name === "Ann Example");
  assertEquals(ann.map((s) => s.days), [["Mon", "Wed"]]);
});

Deno.test("a class with no readable time has no start or end", () => {
  const noTime = block({ ...base, student: "Ed Late" }).replace(
    "Times:,4:00 PM,-,4:30 PM",
    "Times:,soon,-,later",
  );
  assertEquals(parseRoll(noTime).at(0)?.students.map((s) => s.classes), [[at("Mon", null, null)]]);
});

Deno.test("classesOf gives students saved without classes a class on each day, with no time", () => {
  const old = { name: "Old", address: "", days: ["Mon" as const, "Thu" as const], classes: [] };
  assertEquals(classesOf(old), [at("Mon", null, null), at("Thu", null, null)]);
  assertEquals(classesOf({ ...old, classes: [at("Mon", 600, 630)] }), [at("Mon", 600, 630)]);
});

Deno.test("text that isn't a class roll has no teachers", () => {
  assertEquals(parseRoll("hello\nworld"), []);
  assertEquals(parseRoll(""), []);
});
