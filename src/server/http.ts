/**
 * Types and helpers shared by the server's functional core: the shape of
 * requests and responses, the I/O pipes, and the errors routes can raise.
 */
import { Context, Data, type Effect } from "effect";

export class IoError extends Data.TaggedError("IoError")<{ cause: unknown }> {}

/** The client sent something unacceptable (400). */
export class BadRequest extends Data.TaggedError("BadRequest")<{ message: string }> {}

/** Data on disk can't be used (500). */
export class CorruptData extends Data.TaggedError("CorruptData")<{ message: string }> {}

export type RouteError = BadRequest | CorruptData | IoError;

export type Bytes = Uint8Array<ArrayBuffer>;

export class ServerIo extends Context.Tag("ServerIo")<
  ServerIo,
  {
    /** Fails with the runtime's raw error; the core decides what it means. */
    readonly readLayoutFile: Effect.Effect<string, IoError>;
    readonly writeLayoutTempFile: (text: string) => Effect.Effect<void, IoError>;
    /** Atomically replaces the layout file with the temp file. */
    readonly commitLayoutTempFile: Effect.Effect<void, IoError>;
    /** Reads a file from the widget build's output, by its path there. */
    readonly readWidgetFile: (path: string) => Effect.Effect<Bytes, IoError>;
    /**
     * GETs a URL from the web (for the feeds API), without following redirects.
     * Fails when it can't be reached; its answer may be cached for a few minutes.
     */
    readonly httpGet: (url: string) => Effect.Effect<HttpGot, IoError>;
    /**
     * The geocoders, which turn addresses into coordinates. Each sends the addresses to an
     * outside service, and answers with its raw text. Nothing is logged or kept.
     */
    /** The US Census batch geocoder: CSV in, CSV out. */
    readonly geocodeBatch: (csv: string) => Effect.Effect<string, IoError>;
    /** The US Census geocoder for one address on one line: JSON out. */
    readonly geocodeOneLine: (query: string) => Effect.Effect<string, IoError>;
    /** OpenStreetMap's Nominatim, which also knows cross streets: JSON out. */
    readonly geocodeNominatim: (query: string) => Effect.Effect<string, IoError>;
  }
>() {}

/** What a URL answered with. */
export type HttpGot = {
  readonly status: number;
  /** The Location header (a redirect's target), as given. */
  readonly location: string | null;
  readonly contentType: string | null;
  /** The body, or null when it was more than the most read (see maxHttpGetBytes). */
  readonly body: Bytes | null;
};

/** The most of a body httpGet reads. */
export const maxHttpGetBytes = 5_000_000;

export type Asset = {
  readonly contentType: string;
  readonly body: Bytes;
};

export type Site = {
  /** Hosts (`name:port`) this server answers to. Guards DNS rebinding. */
  readonly hosts: ReadonlySet<string>;
  /** Bundled client files, keyed by file name. */
  readonly assets: ReadonlyMap<string, Asset>;
  /** Cache-busting token for asset URLs embedded in the page. */
  readonly buildId: string;
  /** Where the page finds the assistant service (on this host). */
  readonly assistantPort: number;
};

export type HttpRequest = {
  readonly method: string;
  readonly url: URL;
  readonly origin: string | null;
  /** The body as text. */
  readonly body: Effect.Effect<string, IoError>;
};

export type HttpResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** A stream is sent as it's produced (e.g. the assistant's progress). */
  readonly body: string | Bytes | ReadableStream<Bytes> | null;
};

export const text = (status: number, body: string): HttpResponse => ({
  status,
  headers: { "content-type": "text/plain; charset=utf-8" },
  body,
});

export const json = (body: unknown, status = 200): HttpResponse => ({
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

export const methodNotAllowed = (allow: string): HttpResponse => ({
  status: 405,
  headers: { allow },
  body: null,
});

export const contentTypeFor = (name: string): string => {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "js":
      return "text/javascript; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "map":
    case "json":
      return "application/json; charset=utf-8";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
};
