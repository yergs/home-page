/** Distances between places on Earth, and which of a set of places are within reach. */
import type { Coordinates } from "../../../common/geocode.ts";

const earthRadiusMiles = 3958.7613;
const radians = (degrees: number) => degrees * Math.PI / 180;

/** The great-circle (straight-line) distance between two places, in miles. */
export const milesBetween = (a: Coordinates, b: Coordinates): number => {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(h)));
};

export type Place<T> = { readonly item: T; readonly at: Coordinates; readonly miles: number };

/** The places within `miles` of `center`, nearest first. */
export const within = <T>(
  places: ReadonlyArray<{ readonly item: T; readonly at: Coordinates }>,
  center: Coordinates,
  miles: number,
): ReadonlyArray<Place<T>> =>
  places
    .map((p) => ({ ...p, miles: milesBetween(center, p.at) }))
    .filter((p) => p.miles <= miles)
    .sort((a, b) => a.miles - b.miles);

/** Roads wind: a drive is about this much longer than the straight line. */
const roadFactor = 1.3;
const averageMph = 30;

/** A rough drive time for a straight-line distance, in whole minutes (at least 1 for any distance). */
export const driveMinutes = (miles: number): number =>
  miles <= 0 ? 0 : Math.max(1, Math.round(miles * roadFactor / averageMph * 60));

/** A drive time for people to read: "12 min", "1 hr 5 min", "2 hr". */
export const formatDrive = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
};
