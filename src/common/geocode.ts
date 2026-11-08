/**
 * Geocoding, turning addresses into coordinates: what the page asks the server
 * for, and how the server reads the US Census geocoder's and OpenStreetMap
 * Nominatim's answers. Pure; the server does the network calls.
 */
import { Either, Schema } from "effect";
import { parseCsv, toCsv } from "./csv.ts";

export const Coordinates = Schema.Struct({ lat: Schema.Number, lon: Schema.Number });
export type Coordinates = typeof Coordinates.Type;

export const AddressQuery = Schema.Struct({
  street: Schema.String,
  city: Schema.String,
  state: Schema.String,
  zip: Schema.String,
});
export type AddressQuery = typeof AddressQuery.Type;

/** The most addresses one batch request may hold. */
export const maxBatch = 1000;

/** POST /api/geocode/batch */
export const BatchRequest = Schema.Struct({
  addresses: Schema.Array(AddressQuery).pipe(Schema.maxItems(maxBatch)),
});
/** The answer: one entry per address, in order; null where nothing matched. */
export const BatchResponse = Schema.Struct({
  results: Schema.Array(Schema.NullOr(Coordinates)),
});

/** POST /api/geocode/place: a street address, or cross streets, as one line of text. */
export const PlaceRequest = Schema.Struct({ query: Schema.String.pipe(Schema.minLength(1)) });
export const PlaceResponse = Schema.Struct({
  lat: Schema.Number,
  lon: Schema.Number,
  label: Schema.String,
});
export type PlaceResponse = typeof PlaceResponse.Type;

/** The CSV the Census batch geocoder takes: id, street, city, state, zip, with no header. */
export const censusBatchCsv = (addresses: ReadonlyArray<AddressQuery>): string =>
  toCsv(addresses.map((a, i) => [String(i), a.street, a.city, a.state, a.zip]));

/** Reads the Census batch answer into one result per address sent, null where there was no match. */
export const parseCensusBatch = (
  text: string,
  count: number,
): ReadonlyArray<Coordinates | null> => {
  const results: Array<Coordinates | null> = Array.from({ length: count }, () => null);
  for (const row of parseCsv(text)) {
    const index = Number(row.at(0));
    const [lon, lat] = (row.at(5) ?? "").split(",").map(Number);
    if (
      row.at(2) === "Match" && Number.isInteger(index) && index >= 0 && index < count &&
      lon !== undefined && lat !== undefined && Number.isFinite(lon) && Number.isFinite(lat)
    ) {
      results[index] = { lat, lon };
    }
  }
  return results;
};

const CensusOneLine = Schema.Struct({
  result: Schema.Struct({
    addressMatches: Schema.Array(Schema.Struct({
      matchedAddress: Schema.String,
      coordinates: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
    })),
  }),
});

const parseJson = (text: string): unknown =>
  Either.getOrElse(Either.try(() => JSON.parse(text)), () => null);

/** The first match in a Census one-line answer, if any. */
export const parseCensusOneLine = (text: string): PlaceResponse | null => {
  const decoded = Schema.decodeUnknownEither(CensusOneLine)(parseJson(text));
  const match = Either.isRight(decoded) ? decoded.right.result.addressMatches.at(0) : undefined;
  return match === undefined ? null : {
    lat: match.coordinates.y,
    lon: match.coordinates.x,
    label: match.matchedAddress,
  };
};

const Nominatim = Schema.Array(Schema.Struct({
  lat: Schema.NumberFromString,
  lon: Schema.NumberFromString,
  display_name: Schema.String,
}));

/** The first match in a Nominatim answer, if any. */
export const parseNominatim = (text: string): PlaceResponse | null => {
  const decoded = Schema.decodeUnknownEither(Nominatim)(parseJson(text));
  const match = Either.isRight(decoded) ? decoded.right.at(0) : undefined;
  return match === undefined ? null : { lat: match.lat, lon: match.lon, label: match.display_name };
};
