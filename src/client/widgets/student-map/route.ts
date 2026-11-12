/** A teacher's day as a route: the classes in time order, and the drive from each to the next. */
import type { Coordinates } from "../../../common/geocode.ts";
import { driveMinutes, milesBetween } from "../../widget-kit/map/distance.ts";
import type { ClassTime } from "./report.ts";

export type Stop<T> = {
  readonly item: T;
  readonly name: string;
  /** Where the family lives; null if it isn't known. */
  readonly at: Coordinates | null;
  readonly time: ClassTime;
};

/** The drive from the previous stop to this one. */
export type Leg = {
  readonly miles: number;
  /** A rough drive time; 0 if it's the same place. */
  readonly minutes: number;
  /** Minutes between the previous class ending and this one starting; null if either is unknown. */
  readonly gap: number | null;
  /** The drive takes longer than the time between the classes. */
  readonly tight: boolean;
};

/** Closer than this is the same place, as for two children of one family. */
const samePlaceMiles = 0.05;

/** A rough drive time between two places, in minutes: 0 if they're the same place. */
export const driveBetween = (a: Coordinates, b: Coordinates): number => {
  const miles = milesBetween(a, b);
  return miles < samePlaceMiles ? 0 : driveMinutes(miles);
};

export const legBetween = <T>(from: Stop<T>, to: Stop<T>): Leg | null => {
  if (from.at === null || to.at === null) return null;
  const miles = milesBetween(from.at, to.at);
  const minutes = driveBetween(from.at, to.at);
  const gap = from.time.end === null || to.time.start === null
    ? null
    : to.time.start - from.time.end;
  return { miles, minutes, gap, tight: gap !== null && minutes > gap };
};

/** The stops in time order (those with no time last, then by name), each with its leg from the one before. */
export const dayRoute = <T>(
  stops: ReadonlyArray<Stop<T>>,
): ReadonlyArray<{ readonly stop: Stop<T>; readonly leg: Leg | null }> => {
  const ordered = [...stops].sort((a, b) =>
    (a.time.start ?? Infinity) - (b.time.start ?? Infinity) || a.name.localeCompare(b.name)
  );
  return ordered.map((stop, i) => {
    const before = ordered.at(i - 1);
    return { stop, leg: i === 0 || before === undefined ? null : legBetween(before, stop) };
  });
};

/** The minutes of driving between a route's stops, where they're known. */
export const totalMinutes = (
  route: ReadonlyArray<{ readonly leg: Leg | null }>,
): number => route.reduce((sum, r) => sum + (r.leg?.minutes ?? 0), 0);
