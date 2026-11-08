/**
 * Widget types: the manifest each widget folder provides, and the registry the
 * widget build collects them into.
 */
import { Either, Schema } from "effect";
import { Capability, defaultInputTraits, InputTraits } from "./agent-capabilities.ts";

/** A widget type's ID: its folder's name under src/client/widgets/. */
export const WidgetId = Schema.String.pipe(Schema.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/));

/** A web address that must be https. */
const HttpsUrl = Schema.String.pipe(
  Schema.pattern(/^https:\/\/\S+$/, { message: () => "must be an https:// URL" }),
);

/** An outside service a widget sends data to. */
export const OutsideService = Schema.Struct({
  /** Who it is, e.g. "US Census Geocoder". */
  name: Schema.NonEmptyTrimmedString,
  /** What the widget sends it, in plain words, e.g. "The street addresses in your CSV". */
  sends: Schema.NonEmptyTrimmedString,
  privacyPolicy: HttpsUrl,
  terms: HttpsUrl,
});
export type OutsideService = typeof OutsideService.Type;

/**
 * The outside services a widget sends data to. The page doesn't load such a widget
 * until the user has read these and agreed (see src/client/permissions.ts).
 */
export const Permissions = Schema.Struct({ services: Schema.NonEmptyArray(OutsideService) });
export type Permissions = typeof Permissions.Type;

/**
 * An AI agent a widget runs for one task: Claude with the widget's instructions as
 * its whole system prompt, no tools at all, answering with data matching `output`.
 * The assistant service runs it (see src/server/widget-agents.ts).
 */
export type WidgetAgent = {
  /** What it does, e.g. "Grammar check". */
  readonly title: string;
  /** Its entire system prompt. Claude Code's own isn't used. */
  readonly instructions: string;
  /** What it must answer with. Converted to JSON Schema by the widget build. */
  readonly output: Schema.Schema.AnyNoContext;
  /** A model ID, e.g. "claude-sonnet-5-5"; the user's default if left out. */
  readonly model?: string;
  /**
   * The models a run may be let choose from (IDs from agent-models.ts), for a widget
   * whose config lets the user pick one. The server runs only a model listed here, so
   * a run can't ask for any other. Left out (the default) fixes the model to `model`.
   */
  readonly models?: ReadonlyArray<string>;
  /** Most turns a run may take (structured output can take a retry or two). */
  readonly maxTurns: number;
  /** Most a run may cost, in US dollars. */
  readonly maxBudgetUsd: number;
  /** Longest a run may take, waiting for the user's answers included (default 3). */
  readonly maxMinutes?: number;
  /**
   * What it may do beyond answering (see agent-capabilities.ts), each `auto` or `ask`.
   * None if left out: it's given the input, and answers.
   */
  readonly capabilities?: ReadonlyArray<Capability>;
  /** What its input holds; private and possibly untrusted if left out. */
  readonly input?: InputTraits;
};

/**
 * How big a widget's full-screen view opens, as a modal over the page (and so, at
 * first, its own window if it's torn off).
 */
export const FullScreenSize = Schema.Struct({
  /**
   * In rem, the page's unit (a hundredth of the window's width, so it scales with the
   * window), or "full" for the window's width. Never wider than the window.
   */
  width: Schema.Union(Schema.Literal("full"), Schema.Number.pipe(Schema.between(20, 100))),
  /** "full" for the window's height, or "fit" for as tall as the view's content (at most that). */
  height: Schema.Literal("full", "fit"),
});
export type FullScreenSize = typeof FullScreenSize.Type;

/** A full-screen view's size, unless its manifest says otherwise: the whole window. */
export const defaultFullScreenSize: FullScreenSize = { width: "full", height: "full" };

/** What a widget's `manifest.ts` exports as `manifest`. */
export type WidgetManifest<A, I> = {
  readonly title: string;
  readonly description: string;
  /** Decodes the widget's config, as it's saved in the layout. */
  readonly config: Schema.Schema<A, I>;
  /** The config a new widget of this type starts with. */
  readonly defaultConfig: A;
  /**
   * The outside services it sends data to, if any: the user is asked to agree before
   * the widget is used. Leave it out for a widget that sends nothing anywhere.
   */
  readonly permissions?: Permissions;
  /**
   * The AI agents it runs, by name. What it sends them goes to Anthropic, so a widget
   * with agents must declare that under `permissions` too.
   */
  readonly agents?: Readonly<Record<string, WidgetAgent>>;
  /**
   * The widget APIs it uses, by name (src/common/apis/all.ts). Each API's outside
   * services must be listed under `permissions`. A widget with agents gets the
   * agent-runs API without listing it. See the `widget-apis` skill.
   */
  readonly apis?: ReadonlyArray<string>;
  /**
   * How big its full-screen view (if it has one) opens. The whole window if left out:
   * give a narrower one when the view doesn't need it.
   */
  readonly fullScreen?: FullScreenSize;
  /**
   * False when the widget ends in an edge of its own (a list sunk into the column,
   * say), so the page draws no rule between it and the widget below. True if left out.
   */
  readonly ruleBelow?: boolean;
};

/** Declares a manifest, checking its shape. */
export const defineManifest = <A, I>(manifest: WidgetManifest<A, I>): WidgetManifest<A, I> =>
  manifest;

const AnySchema = Schema.declare(
  (u: unknown): u is Schema.Schema<unknown, unknown> => Schema.isSchema(u),
  { identifier: "Schema" },
);

/** A manifest module, as the build imports it. */
const ManifestModule = Schema.Struct({
  manifest: Schema.Struct({
    title: Schema.NonEmptyTrimmedString,
    description: Schema.NonEmptyTrimmedString,
    config: AnySchema,
    defaultConfig: Schema.Unknown,
    permissions: Schema.optionalWith(Permissions, { exact: true }),
    agents: Schema.optionalWith(
      Schema.Record({
        key: WidgetId,
        value: Schema.Struct({
          title: Schema.NonEmptyTrimmedString,
          instructions: Schema.NonEmptyTrimmedString,
          output: AnySchema,
          model: Schema.optionalWith(Schema.NonEmptyTrimmedString, { exact: true }),
          models: Schema.optionalWith(Schema.Array(Schema.NonEmptyTrimmedString), { exact: true }),
          maxTurns: Schema.Int.pipe(Schema.between(1, 100)),
          maxBudgetUsd: Schema.Number.pipe(Schema.between(0.01, 10)),
          maxMinutes: Schema.optionalWith(Schema.Number.pipe(Schema.between(1, 30)), {
            exact: true,
          }),
          capabilities: Schema.optionalWith(Schema.Array(Capability), { exact: true }),
          input: Schema.optionalWith(InputTraits, { exact: true }),
        }),
      }),
      { exact: true },
    ),
    apis: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
    fullScreen: Schema.optionalWith(FullScreenSize, { exact: true }),
    ruleBelow: Schema.optionalWith(Schema.Boolean, { exact: true }),
  }),
});

export const decodeManifestModule = (
  module: unknown,
): Either.Either<WidgetManifest<unknown, unknown>, string> =>
  Either.map(
    Either.mapLeft(Schema.decodeUnknownEither(ManifestModule)(module), (e) => e.message),
    (m) => m.manifest,
  );

/** A widget's agent as the registry has it, for the assistant service to run. */
export const AgentEntry = Schema.Struct({
  title: Schema.String,
  instructions: Schema.String,
  /** What it must answer with, as JSON Schema. */
  outputSchema: Schema.Unknown,
  /** null for the user's default. */
  model: Schema.NullOr(Schema.String),
  /** The models a run may be let choose from; empty fixes the model to `model`. */
  models: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  maxTurns: Schema.Number,
  maxBudgetUsd: Schema.Number,
  maxMinutes: Schema.optionalWith(Schema.Number, { default: () => defaultMaxMinutes }),
  capabilities: Schema.optionalWith(Schema.Array(Capability), { default: () => [] }),
  input: Schema.optionalWith(InputTraits, { default: () => defaultInputTraits }),
});
export type AgentEntry = typeof AgentEntry.Type;

/** How long a run may take, unless its agent says otherwise. */
export const defaultMaxMinutes = 3;

export const RegistryEntry = Schema.Struct({
  id: WidgetId,
  title: Schema.String,
  description: Schema.String,
  /** Changes whenever the bundle does, for cache-busting its URL. */
  version: Schema.String,
  /** The config's JSON Schema, for the assistant. */
  configSchema: Schema.Unknown,
  /** A new widget's config, as it's saved in the layout. */
  defaultConfig: Schema.Unknown,
  /** The outside services it sends data to; null when it sends nothing anywhere. */
  permissions: Schema.optionalWith(Schema.NullOr(Permissions), { default: () => null }),
  /** Its AI agents, by name. */
  agents: Schema.optionalWith(Schema.Record({ key: Schema.String, value: AgentEntry }), {
    default: () => ({}),
  }),
  /**
   * The widget APIs the page gives it (src/common/apis/all.ts): those its manifest
   * declares, and agent-runs if it has agents.
   */
  apis: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  /** How big its full-screen view opens. */
  fullScreen: Schema.optionalWith(FullScreenSize, { default: () => defaultFullScreenSize }),
  /** Whether the page draws a rule between it and the widget below it. */
  ruleBelow: Schema.optionalWith(Schema.Boolean, { default: () => true }),
});
export type RegistryEntry = typeof RegistryEntry.Type;

export const Registry = Schema.Struct({ widgets: Schema.Array(RegistryEntry) });
export type Registry = typeof Registry.Type;

/** Where each widget's files are, relative to the widget build's output. */
export const registryFile = "registry.json";
export const bundleFile = (id: string): string => `${id}/main.js`;

/** Where the server serves the widget build's output. */
export const widgetAssetsPath = "/web/assets/widgets/";

/** A widget's bundle URL, versioned so a reload never gets a stale one from cache. */
export const widgetBundleUrl = (registry: Registry, id: string): Either.Either<string, string> => {
  const entry = registry.widgets.find((w) => w.id === id);
  return entry === undefined
    ? Either.left(`There's no widget type called "${id}"`)
    : Either.right(`${widgetAssetsPath}${bundleFile(id)}?v=${encodeURIComponent(entry.version)}`);
};
