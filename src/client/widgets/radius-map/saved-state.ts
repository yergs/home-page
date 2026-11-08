/** What the radius map page keeps in this browser between visits: the CSV, its mapping and the teachers. */
import { Either, Schema } from "effect";
import { fields } from "./columns.ts";

const Index = Schema.NullOr(Schema.Number);

export const SavedState = Schema.Struct({
  csv: Schema.NullOr(Schema.Struct({
    fileName: Schema.String,
    headers: Schema.Array(Schema.String),
    rows: Schema.Array(Schema.Array(Schema.String)),
  })),
  mapping: Schema.NullOr(Schema.Struct({
    name: Index,
    street: Index,
    city: Index,
    state: Index,
    zip: Index,
  })),
  starts: Schema.Array(Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    text: Schema.String,
    milesText: Schema.String,
  })),
});
export type SavedState = typeof SavedState.Type;

/** What a first visit starts with: nothing loaded, and one empty teacher. */
export const emptyState: SavedState = {
  csv: null,
  mapping: null,
  starts: [{ id: 0, name: "", text: "", milesText: "10" }],
};

/** The saved state in its stored text. */
export const encodeState = (state: SavedState): string => JSON.stringify(state);

/** The state from its stored text; an empty one if there's none, or it isn't readable. */
export const decodeState = (stored: string | null): SavedState => {
  if (stored === null) return emptyState;
  const parsed = Either.try(() => JSON.parse(stored) as unknown);
  const decoded = Either.flatMap(parsed, Schema.decodeUnknownEither(SavedState));
  // A mapping must point at columns the CSV has; one saved against a different file is dropped.
  if (Either.isLeft(decoded)) return emptyState;
  const { csv, mapping } = decoded.right;
  const valid = csv === null || mapping === null ||
    fields.every((f) => mapping[f] === null || (mapping[f] ?? 0) < csv.headers.length);
  return valid ? decoded.right : { ...decoded.right, mapping: null };
};
