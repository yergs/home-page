/** Days of the week, and the color each has on the map. */

export const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = (typeof days)[number];

/** Each day's full name, for headings. */
export const fullDay: Readonly<Record<Day, string>> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

/** Distinct, readable on a map's pale background, and apart from each other. */
export const dayColor: Readonly<Record<Day, string>> = {
  Mon: "#2563eb",
  Tue: "#16a34a",
  Wed: "#f59e0b",
  Thu: "#9333ea",
  Fri: "#dc2626",
  Sat: "#0891b2",
  Sun: "#db2777",
};

/** The days named in a text such as "Mon" or "Tue, Thu", by each word's first three letters. */
export const parseDays = (text: string): ReadonlyArray<Day> => {
  const named = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return days.filter((d) => named.some((w) => w.slice(0, 3) === d.toLowerCase()));
};

/** Days in week order, without repeats. */
export const sortedDays = (list: ReadonlyArray<Day>): ReadonlyArray<Day> =>
  days.filter((d) => list.includes(d));

/** A day's place in a week that starts on Sunday (Sunday 0 ... Saturday 6). */
export const sundayFirst = (day: Day): number => (days.indexOf(day) + 1) % 7;

/** The earliest of these days in a week that starts on Sunday, or null if there are none. */
export const firstDay = (list: ReadonlyArray<Day>): Day | null =>
  [...list].sort((a, b) => sundayFirst(a) - sundayFirst(b)).at(0) ?? null;
