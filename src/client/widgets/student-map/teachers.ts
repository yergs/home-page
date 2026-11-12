/** The teachers on the student map: adding them from a class roll, and telling their students apart. */
import { nextShape } from "../../widget-kit/map/shapes.ts";
import type { TeacherRoll } from "./report.ts";
import type { SavedTeacher } from "./saved-state.ts";

export type Teacher = SavedTeacher;

/** Students' ids on the map: unique across teachers, and below {@link prospectBase}. */
export const studentId = (teacherId: number, index: number): number => teacherId * 10000 + index;

/** The teacher and the student's position in their list, from a student's id on the map. */
export const fromStudentId = (id: number): { teacherId: number; index: number } => ({
  teacherId: Math.floor(id / 10000),
  index: id % 10000,
});

/** New families' ids start here, so they never collide with students'. */
export const prospectBase = 1_000_000;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The teachers after loading a class roll file: each teacher in it gets their students
 * from the file, keeping their address, range, shape and visibility if they were already
 * here (matched by name), or is added with the next free id and shape. Teachers who aren't
 * in the file are left as they were.
 */
export const withRolls = (
  teachers: ReadonlyArray<Teacher>,
  rolls: ReadonlyArray<TeacherRoll>,
  fileName: string,
): ReadonlyArray<Teacher> =>
  rolls.reduce<ReadonlyArray<Teacher>>((all, roll) => {
    const have = all.find((t) => sameName(t.name, roll.teacher));
    return have !== undefined
      ? all.map((t) => t === have ? { ...t, students: roll.students, fileName } : t)
      : [...all, {
        id: Math.max(-1, ...all.map((t) => t.id)) + 1,
        name: roll.teacher.trim(),
        text: "",
        milesText: "10",
        visible: true,
        shape: nextShape(all.map((t) => t.shape)),
        fileName,
        students: roll.students,
        found: null,
      }];
  }, teachers);

/** A teacher added by hand, with no students yet; they can be added one at a time. */
export const blankTeacher = (teachers: ReadonlyArray<Teacher>): Teacher => ({
  id: Math.max(-1, ...teachers.map((t) => t.id)) + 1,
  name: "",
  text: "",
  milesText: "10",
  visible: true,
  shape: nextShape(teachers.map((t) => t.shape)),
  fileName: "added by hand",
  students: [],
  found: null,
});

/** Where a teacher's address was found, if it was found for the address as it is now. */
export const placeOf = (
  teacher: Teacher,
): { readonly at: { readonly lat: number; readonly lon: number }; readonly label: string } | null =>
  teacher.found !== null && teacher.found.text === teacher.text.trim()
    ? { at: { lat: teacher.found.lat, lon: teacher.found.lon }, label: teacher.found.label }
    : null;
