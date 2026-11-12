/**
 * What the student map keeps in this browser between visits: each teacher with their
 * students, and the new families being considered. Saves from when there was one
 * teacher are carried over.
 */
import { Either, Schema } from "effect";
import { teacherShapes } from "../../widget-kit/map/shapes.ts";
import { days } from "./days.ts";

const Day = Schema.Literal(...days);

const Student = Schema.Struct({
  name: Schema.String,
  address: Schema.String,
  days: Schema.Array(Day),
  // Saves from before class times were kept have none: those students have no times.
  classes: Schema.optionalWith(
    Schema.Array(Schema.Struct({
      day: Day,
      start: Schema.NullOr(Schema.Number),
      end: Schema.NullOr(Schema.Number),
    })),
    { default: () => [] },
  ),
});

const Prospect = Schema.Struct({ id: Schema.Number, name: Schema.String, text: Schema.String });

const Teacher = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  /** Their starting address or cross streets; the range is drawn from here. */
  text: Schema.String,
  milesText: Schema.String,
  /** Hidden teachers are off the map and out of where new families could fit. */
  visible: Schema.Boolean,
  /** The shape their students have on the map. */
  shape: Schema.Literal(...teacherShapes),
  fileName: Schema.String,
  students: Schema.Array(Student),
  /** Where `text` was found on the map, and the text it was found for; null until it's looked up. */
  found: Schema.optionalWith(
    Schema.NullOr(Schema.Struct({
      text: Schema.String,
      lat: Schema.Number,
      lon: Schema.Number,
      label: Schema.String,
    })),
    { default: () => null },
  ),
});
export type SavedTeacher = typeof Teacher.Type;

export const SavedState = Schema.Struct({
  teachers: Schema.Array(Teacher),
  prospects: Schema.Array(Prospect),
  hiddenDays: Schema.Array(Day),
  /** How long a lesson for a new family would be, in minutes, as typed. */
  lessonText: Schema.optionalWith(Schema.String, { default: () => "30" }),
});
export type SavedState = typeof SavedState.Type;

/** The state as it was saved when the map had one teacher. */
const OneTeacherState = Schema.Struct({
  fileName: Schema.String,
  report: Schema.NullOr(Schema.Struct({ teacher: Schema.String, students: Schema.Array(Student) })),
  teacher: Schema.Struct({ name: Schema.String, text: Schema.String, milesText: Schema.String }),
  prospects: Schema.Array(Prospect),
  hiddenDays: Schema.Array(Day),
});

export const emptyState: SavedState = {
  teachers: [],
  prospects: [],
  hiddenDays: [],
  lessonText: "30",
};

export const encodeState = (state: SavedState): string => JSON.stringify(state);

/** The state from its stored text; an empty one if there's none or it isn't readable. */
export const decodeState = (stored: string | null): SavedState => {
  if (stored === null) return emptyState;
  const parsed = Either.try(() => JSON.parse(stored) as unknown);
  if (Either.isLeft(parsed)) return emptyState;
  const current = Schema.decodeUnknownEither(SavedState)(parsed.right);
  if (Either.isRight(current)) return current.right;
  const old = Schema.decodeUnknownEither(OneTeacherState)(parsed.right);
  if (Either.isLeft(old)) return emptyState;
  const { report, teacher, fileName, prospects, hiddenDays } = old.right;
  return {
    ...emptyState,
    prospects,
    hiddenDays,
    teachers: report === null ? [] : [{
      id: 0,
      name: teacher.name.trim() !== "" ? teacher.name : report.teacher,
      text: teacher.text,
      milesText: teacher.milesText,
      visible: true,
      shape: "circle",
      fileName,
      students: report.students,
      found: null,
    }],
  };
};
