/** The student map widget's config: just a heading. The map opens in the full-screen view. */
import { Schema } from "effect";

export const StudentMapConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type StudentMapConfig = typeof StudentMapConfig.Type;
