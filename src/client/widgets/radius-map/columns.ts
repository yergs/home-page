/** Reading a CSV of people and addresses: which column is which, and each row's address. */
import type { AddressQuery } from "../../../common/geocode.ts";

export const fields = ["name", "street", "city", "state", "zip"] as const;
export type Field = (typeof fields)[number];

/** For each field, the index of the CSV column that holds it, or null if none does. */
export type Mapping = Readonly<Record<Field, number | null>>;

/** Header names, lowercased with spaces and punctuation dropped, that suggest each field. */
const guesses: Readonly<Record<Field, ReadonlyArray<string>>> = {
  name: ["name", "fullname", "family", "student", "contact", "parent", "guardian"],
  street: ["street", "streetaddress", "address", "address1", "addressline1", "addr"],
  city: ["city", "town"],
  state: ["state", "st", "province"],
  zip: ["zip", "zipcode", "postalcode", "postcode", "postal"],
};

const simplify = (header: string): string => header.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

/** Guesses the mapping from the header row: an exact match first, then a header containing the word. */
export const detectMapping = (headers: ReadonlyArray<string>): Mapping => {
  const simple = headers.map(simplify);
  const taken = new Set<number>();
  const find = (field: Field): number | null => {
    const options = guesses[field];
    const exact = simple.findIndex((h, i) => !taken.has(i) && options.includes(h));
    const loose = exact >= 0
      ? exact
      : simple.findIndex((h, i) =>
        !taken.has(i) && field !== "state" && options.some((o) => o.length > 3 && h.includes(o))
      );
    if (loose < 0) {
      return null;
    }
    taken.add(loose);
    return loose;
  };
  // The street goes before the rest, so "address" isn't taken by a vaguer match.
  const street = find("street");
  return {
    name: find("name"),
    street,
    city: find("city"),
    state: find("state"),
    zip: find("zip"),
  };
};

const cell = (row: ReadonlyArray<string>, index: number | null): string =>
  index === null ? "" : (row.at(index) ?? "").trim();

/** A row's address, as the geocoder wants it. */
export const rowAddress = (row: ReadonlyArray<string>, mapping: Mapping): AddressQuery => ({
  street: cell(row, mapping.street),
  city: cell(row, mapping.city),
  state: cell(row, mapping.state),
  zip: cell(row, mapping.zip),
});

/** A row's name, or its address if there's no name. */
export const rowName = (row: ReadonlyArray<string>, mapping: Mapping): string => {
  const name = cell(row, mapping.name);
  if (name !== "") {
    return name;
  }
  const a = rowAddress(row, mapping);
  return [a.street, a.city].filter((p) => p !== "").join(", ");
};

/** Whether there's enough to look an address up: a street, and a city or zip. */
export const isLookable = (a: AddressQuery): boolean =>
  a.street !== "" && (a.city !== "" || a.zip !== "");

/** The same address spelled any way of the same letters, so it's looked up once. */
export const addressKey = (a: AddressQuery): string =>
  [a.street, a.city, a.state, a.zip].map((p) => p.toLowerCase().replaceAll(/\s+/g, " ").trim())
    .join("|");
