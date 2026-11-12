/** Telling addresses apart: whether one can be looked up, and when two are the same. */
import type { AddressQuery } from "../../../common/geocode.ts";

/** Whether there's enough to look an address up: a street, and a city or zip. */
export const isLookable = (a: AddressQuery): boolean =>
  a.street !== "" && (a.city !== "" || a.zip !== "");

/** The same address spelled any way of the same letters, so it's looked up once. */
export const addressKey = (a: AddressQuery): string =>
  [a.street, a.city, a.state, a.zip].map((p) => p.toLowerCase().replaceAll(/\s+/g, " ").trim())
    .join("|");
