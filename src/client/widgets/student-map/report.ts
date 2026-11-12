/**
 * Reading a class roll exported from the scheduling system as text. The export is a
 * report printed to a file: page headers fall anywhere, and each class is a block that
 * starts at its "Days:" line, with its instructor, then each student followed by that
 * student's family address. Only the students, their addresses, their days and the
 * teacher are taken from it.
 */
import { parseCsv } from "../../../common/csv.ts";
import { type Day, parseDays, sortedDays } from "./days.ts";
import { parseTime } from "./time.ts";

/** When a class meets, in minutes after midnight; null if the report doesn't say. */
export type ClassTime = {
  readonly day: Day;
  readonly start: number | null;
  readonly end: number | null;
};

export type Student = {
  readonly name: string;
  /** The family address on one line, as the report has it; empty if it has none. */
  readonly address: string;
  /** Every day this student has a class, in week order. */
  readonly days: ReadonlyArray<Day>;
  /** Every class, with its time: one per day (or more, if there are several on a day). */
  readonly classes: ReadonlyArray<ClassTime>;
};

/**
 * A student's classes. Students saved before classes were kept have only days, so they
 * get a class on each day with no time.
 */
export const classesOf = (student: Student): ReadonlyArray<ClassTime> =>
  student.classes.length > 0
    ? student.classes
    : student.days.map((day) => ({ day, start: null, end: null }));

/** One teacher's students: those in the classes that list them as the instructor. */
export type TeacherRoll = {
  /** The instructor's name; empty for classes that list none. */
  readonly teacher: string;
  readonly students: ReadonlyArray<Student>;
};

const fieldsOf = (line: string): ReadonlyArray<string> => parseCsv(line).at(0) ?? [];

/** A student's name as people say it: no "*OO"-style tags, one space between words. */
const cleanName = (name: string): string =>
  name.replaceAll(/\*\s*[A-Za-z]*/g, "").replaceAll(/\s+/g, " ").trim();

const sameAddress = (a: string) => a.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

/** The first instructor named on an "Instructors:" line, which can list several in one field. */
const firstInstructor = (line: string): string =>
  (fieldsOf(line).at(1) ?? "").split(",").map((p) => p.trim()).find((p) => p !== "") ?? "";

/**
 * Reads the report, which can hold any number of teachers' classes, into one roll per
 * teacher. A student in several classes, or on several days, with one teacher is one student;
 * with two teachers, they're a student of each.
 */
export const parseRoll = (text: string): ReadonlyArray<TeacherRoll> => {
  const rows: Array<
    { block: number; name: string; address: string; classes: ReadonlyArray<ClassTime> }
  > = [];
  // Each class is a block, and its instructor is named once in it.
  const instructors = new Map<number, string>();
  let block = -1;
  let days: ReadonlyArray<Day> | null = null;
  // When the class being read meets.
  let time: { start: number | null; end: number | null } = { start: null, end: null };
  // The student whose address line is still to come.
  let waiting: number | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("Date:") && line.includes("Class Roll")) {
      continue;
    }
    if (line.startsWith("Family Address:")) {
      const waited = waiting === null ? undefined : rows[waiting];
      if (waiting !== null && waited !== undefined) {
        rows[waiting] = { ...waited, address: line.slice("Family Address:".length).trim() };
      }
      waiting = null;
      continue;
    }
    if (line.startsWith("Instructors:")) {
      if (!instructors.has(block)) instructors.set(block, firstInstructor(line));
      continue;
    }
    if (line.includes("Days:")) {
      const fields = fieldsOf(line);
      const at = fields.findIndex((f) => f.trim() === "Days:");
      if (at >= 0) {
        block += 1;
        days = parseDays(fields.at(at + 1) ?? "");
        time = { start: null, end: null };
        waiting = null;
        continue;
      }
    }
    if (line.includes("Times:")) {
      const fields = fieldsOf(line);
      const at = fields.findIndex((f) => f.trim() === "Times:");
      if (at >= 0) {
        time = {
          start: parseTime(fields.at(at + 1) ?? ""),
          end: parseTime(fields.at(at + 3) ?? ""),
        };
      }
      continue;
    }
    if (days !== null && /^\d+,/.test(line)) {
      const name = cleanName(fieldsOf(line).at(1) ?? "");
      if (/[A-Za-z]/.test(name)) {
        rows.push({
          block,
          name,
          address: "",
          classes: days.map((day) => ({ day, ...time })),
        });
        waiting = rows.length - 1;
      }
    }
  }

  const merged = new Map<
    string,
    { teacher: string; name: string; address: string; classes: Array<ClassTime> }
  >();
  for (const row of rows) {
    const teacher = instructors.get(row.block) ?? "";
    const key = `${teacher.toLowerCase()}|${row.name.toLowerCase()}|${sameAddress(row.address)}`;
    const found = merged.get(key);
    if (found === undefined) {
      merged.set(key, { teacher, name: row.name, address: row.address, classes: [...row.classes] });
    } else {
      found.classes.push(...row.classes);
    }
  }
  const unique = (classes: ReadonlyArray<ClassTime>) =>
    classes.filter((c, i) =>
      classes.findIndex((o) => o.day === c.day && o.start === c.start && o.end === c.end) === i
    );
  const byTeacher = new Map<string, Array<Student>>();
  for (const m of merged.values()) {
    byTeacher.set(m.teacher, [...(byTeacher.get(m.teacher) ?? []), {
      name: m.name,
      address: m.address,
      days: sortedDays(m.classes.map((c) => c.day)),
      classes: unique(m.classes),
    }]);
  }
  return [...byTeacher]
    .map(([teacher, students]) => ({ teacher, students }))
    .sort((a, b) => a.teacher.localeCompare(b.teacher));
};
