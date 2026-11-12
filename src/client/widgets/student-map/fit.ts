/**
 * Where a family who isn't a student yet could fit: for each teacher and each day they
 * teach, the best gap between two classes (or before the first or after the last) for
 * one more lesson, and how much extra driving that takes. Drives are rough estimates.
 */
import type { Coordinates } from "../../../common/geocode.ts";
import { milesBetween } from "../../widget-kit/map/distance.ts";
import type { Day } from "./days.ts";
import { driveBetween } from "./route.ts";
import { formatTime } from "./time.ts";

/** One class on a teacher's day, as the fit sees it. */
export type Booked = {
  readonly name: string;
  readonly at: Coordinates | null;
  readonly start: number | null;
  readonly end: number | null;
};

export type TeacherDays = {
  readonly teacher: string;
  /** Where the teacher starts from, if known: their range is measured from here. */
  readonly home: Coordinates | null;
  /** How far they'll drive from home. */
  readonly miles: number;
  readonly days: ReadonlyArray<{ readonly day: Day; readonly booked: ReadonlyArray<Booked> }>;
};

export type Fit = {
  readonly teacher: string;
  readonly day: Day;
  /** Who they'd be after and before in that day's route; null at the day's start or end. */
  readonly after: string | null;
  readonly before: string | null;
  /** Extra minutes of driving compared with going straight from the class before to the one after. */
  readonly detour: number;
  /** The earliest the lesson could start, if the class before is known. */
  readonly startsAt: number | null;
};

/** The classes the fit can use: those with a place and a time. */
const usable = (booked: ReadonlyArray<Booked>) =>
  booked.flatMap((b) =>
    b.at === null || b.start === null || b.end === null
      ? []
      : [{ name: b.name, at: b.at, start: b.start, end: b.end }]
  ).sort((a, b) => a.start - b.start);

/**
 * The best place in a day's classes for a lesson of `lesson` minutes at `lead`: the one
 * that adds the least driving among those with room for the drive there, the lesson and the
 * drive on. None if the day has no classes to fit around, or no room.
 */
export const bestSlot = (
  lead: Coordinates,
  booked: ReadonlyArray<Booked>,
  lesson: number,
): Omit<Fit, "teacher" | "day"> | null => {
  const classes = usable(booked);
  if (classes.length === 0) return null;
  const options = [null, ...classes].flatMap((prev, i) => {
    const next = classes.at(i);
    const to = prev === null ? 0 : driveBetween(prev.at, lead);
    const from = next === undefined ? 0 : driveBetween(lead, next.at);
    const room = prev === null || next === undefined ? Infinity : next.start - prev.end;
    // Where there's no class before or after, the drive in or out isn't counted as room needed.
    const needed = to + lesson + from;
    if (room < needed) return [];
    const direct = prev === null || next === undefined ? 0 : driveBetween(prev.at, next.at);
    return [{
      after: prev?.name ?? null,
      before: next?.name ?? null,
      detour: to + from - direct,
      startsAt: prev === null ? null : prev.end + to,
    }];
  });
  return options.sort((a, b) => a.detour - b.detour).at(0) ?? null;
};

/** Whether a teacher's range reaches a place: null if they have no starting place to measure from. */
export const reaches = (t: TeacherDays, lead: Coordinates): boolean | null =>
  t.home === null || t.miles <= 0 ? null : milesBetween(t.home, lead) <= t.miles;

/**
 * Every teacher's best fit on each day, least extra driving first. A teacher whose range
 * is known and doesn't reach the lead has none.
 */
export const fitsFor = (
  lead: Coordinates,
  teachers: ReadonlyArray<TeacherDays>,
  lesson: number,
): ReadonlyArray<Fit> =>
  teachers.flatMap((t) =>
    reaches(t, lead) === false ? [] : t.days.flatMap((d): ReadonlyArray<Fit> => {
      const slot = bestSlot(lead, d.booked, lesson);
      return slot === null ? [] : [{ teacher: t.teacher, day: d.day, ...slot }];
    })
  ).sort((a, b) => a.detour - b.detour);

/** The teachers whose range reaches the lead. */
export const reachedBy = (lead: Coordinates, teachers: ReadonlyArray<TeacherDays>) =>
  teachers.filter((t) => reaches(t, lead) === true).map((t) => t.teacher);

/** A fit in words: "Between Ann and Ben: could start ~4:30 PM, +6 min of driving". */
export const describeFit = (fit: Fit): string => {
  const where = fit.after !== null && fit.before !== null
    ? `Between ${fit.after} and ${fit.before}`
    : fit.after !== null
    ? `After ${fit.after}`
    : fit.before !== null
    ? `Before ${fit.before}`
    : "Anywhere";
  const start = fit.startsAt === null ? "" : `: could start ~${formatTime(fit.startsAt)}`;
  const extra = fit.detour === 0 ? "no extra driving" : `+${fit.detour} min of driving`;
  return `${where}${start}, ${extra}`;
};
