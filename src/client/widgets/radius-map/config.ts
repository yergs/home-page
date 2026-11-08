/** The radius map widget's config: just a heading. The map itself opens on a page of its own. */
import { Schema } from "effect";

export const RadiusMapConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type RadiusMapConfig = typeof RadiusMapConfig.Type;
