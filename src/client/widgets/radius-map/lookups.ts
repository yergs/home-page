/** Deciding which addresses still need looking up, given the coordinates already known. */
import type { AddressQuery, Coordinates } from "../../../common/geocode.ts";
import { addressKey, isLookable } from "./columns.ts";

/** Coordinates by address key; null for an address the geocoder couldn't find. */
export type Known = Readonly<Record<string, Coordinates | null>>;

export type Lookup = { readonly key: string; readonly address: AddressQuery };

/** The distinct, lookable addresses that aren't known yet. */
export const lookupsNeeded = (
  addresses: ReadonlyArray<AddressQuery>,
  known: Known,
): ReadonlyArray<Lookup> => {
  const seen = new Set<string>();
  const needed: Array<Lookup> = [];
  for (const address of addresses) {
    const key = addressKey(address);
    if (isLookable(address) && !(key in known) && !seen.has(key)) {
      seen.add(key);
      needed.push({ key, address });
    }
  }
  return needed;
};

/** Splits a list into runs of at most `size`. */
export const chunks = <T>(items: ReadonlyArray<T>, size: number): ReadonlyArray<ReadonlyArray<T>> =>
  Array.from(
    { length: Math.ceil(items.length / size) },
    (_, i) => items.slice(i * size, (i + 1) * size),
  );
