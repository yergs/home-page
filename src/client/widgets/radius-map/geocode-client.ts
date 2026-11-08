/**
 * The page's side of geocoding: asks this app's server, which asks the US Census
 * (and OpenStreetMap for cross streets), and remembers the answers in this
 * browser only, so an address is sent out once.
 */
import { Effect, Either, Schema } from "effect";
import {
  type AddressQuery,
  BatchResponse,
  type Coordinates,
  maxBatch,
  PlaceResponse,
} from "../../../common/geocode.ts";
import { type Known, type Lookup } from "./lookups.ts";
import { decodeState, encodeState, type SavedState } from "./saved-state.ts";

const cacheKey = "radius-map:known-addresses";

/** What this browser already knows. Only on this computer; "Forget" erases it. */
export const loadKnown = (): Known => {
  const parsed = Either.try(() => JSON.parse(localStorage.getItem(cacheKey) ?? "{}") as unknown);
  const decoded = Either.flatMap(
    parsed,
    Schema.decodeUnknownEither(
      Schema.Record({
        key: Schema.String,
        value: Schema.NullOr(Schema.Struct({ lat: Schema.Number, lon: Schema.Number })),
      }),
    ),
  );
  return Either.getOrElse(decoded, () => ({}));
};

/**
 * Adds to what this browser knows. Merged with what's stored now, so lookups another
 * tab (or another radius map) saved meanwhile aren't lost.
 */
export const saveKnown = (known: Known): void =>
  localStorage.setItem(cacheKey, JSON.stringify({ ...loadKnown(), ...known }));

export const forgetKnown = (): void => localStorage.removeItem(cacheKey);

export type Result<A> = { readonly ok: true; readonly value: A } | {
  readonly ok: false;
  readonly errorMessage: string;
};

const post = async (path: string, body: unknown): Promise<Result<unknown>> => {
  const sent = await Effect.runPromise(Effect.either(Effect.tryPromise({
    try: () =>
      fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    catch: (e) => e instanceof Error ? e.message : String(e),
  })));
  if (Either.isLeft(sent)) {
    return { ok: false, errorMessage: `Couldn't reach the server: ${sent.left}` };
  }
  const response = sent.right;
  if (response.status === 404) {
    return { ok: false, errorMessage: "No match for that place." };
  }
  if (!response.ok) {
    return { ok: false, errorMessage: `The server answered ${response.status}.` };
  }
  return { ok: true, value: await response.json() as unknown };
};

/** Finds a start place, from an address or cross streets typed as one line. */
export const findPlace = async (query: string): Promise<Result<PlaceResponse>> => {
  const result = await post("/api/geocode/place", { query });
  if (!result.ok) {
    return result;
  }
  const decoded = Schema.decodeUnknownEither(PlaceResponse)(result.value);
  return Either.isRight(decoded)
    ? { ok: true, value: decoded.right }
    : { ok: false, errorMessage: "The server's answer wasn't understood." };
};

/** Looks up one batch of at most {@link maxBatch} addresses. */
export const findAddresses = async (
  lookups: ReadonlyArray<Lookup>,
): Promise<Result<ReadonlyArray<readonly [string, Coordinates | null]>>> => {
  const addresses: ReadonlyArray<AddressQuery> = lookups.map((l) => l.address);
  const result = await post("/api/geocode/batch", { addresses });
  if (!result.ok) {
    return result;
  }
  const decoded = Schema.decodeUnknownEither(BatchResponse)(result.value);
  return Either.isRight(decoded) && decoded.right.results.length === lookups.length
    ? {
      ok: true,
      value: lookups.map((l, i) => [l.key, decoded.right.results[i] ?? null] as const),
    }
    : { ok: false, errorMessage: "The server's answer wasn't understood." };
};

export const batchSize = maxBatch;

/** What the page says when the browser has no room to keep the CSV. */
export const savedProblem = "This file is too big to keep in the browser between visits.";

/** Where one radius map widget keeps its state, so each widget has its own. */
const stateKey = (widgetId: string) => `radius-map:page-state:${widgetId}`;

/** Where the state was kept when there was one map for every widget, before full-screen views. */
const sharedStateKey = "radius-map:page-state";

/**
 * The CSV, column choices and teachers this widget saved in this browser. A widget
 * with none yet starts from what was saved before each widget had its own.
 */
export const loadState = (widgetId: string): SavedState =>
  decodeState(localStorage.getItem(stateKey(widgetId)) ?? localStorage.getItem(sharedStateKey));

/** Saves them in this browser only. Fails with a message if the browser has no room (a huge CSV). */
export const saveState = (widgetId: string, state: SavedState): string | null => {
  const saved = Either.try(() => localStorage.setItem(stateKey(widgetId), encodeState(state)));
  return Either.isLeft(saved) ? savedProblem : null;
};

export const forgetState = (widgetId: string): void => {
  localStorage.removeItem(stateKey(widgetId));
  localStorage.removeItem(sharedStateKey);
};
