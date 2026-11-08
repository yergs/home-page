/** Which leads are within reach of which teachers: the nearest teacher, and whether they cover it. */
import type { Coordinates } from "../../../common/geocode.ts";
import { milesBetween } from "./distance.ts";

export type Teacher = {
  readonly label: string;
  readonly at: Coordinates;
  /** How far this teacher will drive. */
  readonly miles: number;
};

export type Assessed<T> = {
  readonly item: T;
  readonly at: Coordinates;
  /** The nearest teacher who reaches this lead; else the nearest teacher at all. None without teachers. */
  readonly nearest: { readonly teacher: Teacher; readonly miles: number } | null;
  /** Every teacher who reaches this lead, nearest first. */
  readonly reaching: ReadonlyArray<{ readonly teacher: Teacher; readonly miles: number }>;
  /** Whether some teacher is willing to drive this far. Always true without teachers. */
  readonly covered: boolean;
};

/** Assesses each lead against every teacher, nearest first; leads with no teacher to compare are last. */
export const assess = <T>(
  leads: ReadonlyArray<{ readonly item: T; readonly at: Coordinates }>,
  teachers: ReadonlyArray<Teacher>,
): ReadonlyArray<Assessed<T>> =>
  leads
    .map((lead): Assessed<T> => {
      const distances = teachers
        .map((teacher) => ({ teacher, miles: milesBetween(teacher.at, lead.at) }))
        .sort((a, b) => a.miles - b.miles);
      const reaching = distances.filter((d) => d.miles <= d.teacher.miles);
      return {
        ...lead,
        nearest: reaching.at(0) ?? distances.at(0) ?? null,
        reaching,
        covered: teachers.length === 0 || reaching.length > 0,
      };
    })
    .sort((a, b) => (a.nearest?.miles ?? 0) - (b.nearest?.miles ?? 0));
