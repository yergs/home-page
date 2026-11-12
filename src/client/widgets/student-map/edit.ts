/** Editing a student by hand: the form's draft, checking it, and the student it makes. */
import { type Day, sortedDays, sundayFirst } from "./days.ts";
import type { ClassTime, Student } from "./report.ts";
import type { Teacher } from "./teachers.ts";
import { formatTime, parseTime } from "./time.ts";

/** A class as typed into the form: its times are text until they're checked. */
export type DraftClass = { readonly day: Day; readonly start: string; readonly end: string };

export type Draft = {
  readonly name: string;
  readonly address: string;
  readonly classes: ReadonlyArray<DraftClass>;
};

/** A blank form for a new student, with one class to fill in. */
export const blankDraft: Draft = {
  name: "",
  address: "",
  classes: [{ day: "Mon", start: "", end: "" }],
};

/** The form for editing a student, with each class's times written out. */
export const draftOf = (student: Student, classes: ReadonlyArray<ClassTime>): Draft => ({
  name: student.name,
  address: student.address,
  classes: classes.map((c) => ({
    day: c.day,
    start: c.start === null ? "" : formatTime(c.start),
    end: c.end === null ? "" : formatTime(c.end),
  })),
});

export type Checked =
  | { readonly ok: true; readonly student: Student }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> };

/** A time field: blank is no time; otherwise it must read as a time. */
const timeField = (text: string): { ok: true; value: number | null } | { ok: false } => {
  if (text.trim() === "") return { ok: true, value: null };
  const value = parseTime(text);
  return value === null ? { ok: false } : { ok: true, value };
};

/** Whether the form can be saved, and if so the student it makes (classes in week order, from Sunday). */
export const checkDraft = (draft: Draft): Checked => {
  const problems: Array<string> = [];
  if (draft.name.trim() === "") problems.push("Enter a name.");
  if (draft.classes.length === 0) problems.push("Add at least one class.");
  const classes: Array<ClassTime> = [];
  for (const c of draft.classes) {
    const start = timeField(c.start);
    const end = timeField(c.end);
    if (!start.ok || !end.ok) {
      problems.push(`${c.day}: write times like 4:15 PM.`);
    } else if (start.value !== null && end.value !== null && end.value <= start.value) {
      problems.push(`${c.day}: the class should end after it starts.`);
    } else {
      classes.push({ day: c.day, start: start.value, end: end.value });
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  const sorted = classes
    .filter((c, i) =>
      classes.findIndex((o) => o.day === c.day && o.start === c.start && o.end === c.end) === i
    )
    .sort((a, b) => sundayFirst(a.day) - sundayFirst(b.day) || (a.start ?? 0) - (b.start ?? 0));
  return {
    ok: true,
    student: {
      name: draft.name.replaceAll(/\s+/g, " ").trim(),
      address: draft.address.replaceAll(/\s+/g, " ").trim(),
      days: sortedDays(sorted.map((c) => c.day)),
      classes: sorted,
    },
  };
};

/** The teacher with a student replaced (at `index`), added (if `index` is null) or removed (if `student` is null). */
export const withStudent = (
  teacher: Teacher,
  index: number | null,
  student: Student | null,
): Teacher => ({
  ...teacher,
  students: index === null
    ? student === null ? teacher.students : [...teacher.students, student]
    : student === null
    ? teacher.students.filter((_, i) => i !== index)
    : teacher.students.map((s, i) => i === index ? student : s),
});
