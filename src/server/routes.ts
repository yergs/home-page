/**
 * Functional core of the webserver: every routing and validation decision
 * lives here. All I/O goes through the injected {@link ServerIo} pipes.
 */
import { Effect, Either, Schema } from "effect";
import {
  BadRequest,
  type HttpRequest,
  type HttpResponse,
  json,
  methodNotAllowed,
  type RouteError,
  ServerIo,
  type Site,
  text,
} from "./http.ts";
import { decodeLayoutJson, readLayout, writeLayout } from "./layout-store.ts";
import { assistantPortMetaName } from "../common/assistant.ts";
import { widgetAssetsPath } from "../common/widgets.ts";
import {
  BatchRequest,
  censusBatchCsv,
  parseCensusBatch,
  parseCensusOneLine,
  parseNominatim,
  PlaceRequest,
} from "../common/geocode.ts";
import { importMap } from "../common/shared-modules.ts";
import { serveWidgetFile } from "./widget-files.ts";
import { feedsServed } from "./feeds-api.ts";
import { layoutServed } from "./layout-api.ts";
import { handleWidgetApis, isWidgetApiRequest, type ServedApi } from "./widget-api-routes.ts";

/**
 * The widget APIs this server serves (the assistant service serves its own). Add an
 * API's `serve(...)` here. See the `widget-apis` skill.
 */
const widgetApis: ReadonlyArray<ServedApi<ServerIo>> = [layoutServed, feedsServed];

/** File name the bundler gives the client entry point (src/client/main.tsx). */
export const clientScript = "main.js";

/** Where the page's bundle is served: the page's script, its chunks and the shared modules. */
export const assetsPath = "/web/assets/";

export const page = (buildId: string, assistantPort: number): string =>
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="${assistantPortMetaName}" content="${assistantPort}">
    <title>Home</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏠</text></svg>">
    <style>html, body, #root { height: 100%; margin: 0; overflow: hidden; }</style>
    <script type="importmap">${JSON.stringify(importMap(assetsPath))}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${assetsPath}${clientScript}?v=${buildId}"></script>
  </body>
</html>
`;

const getLayout = readLayout.pipe(Effect.map((layout) => json(layout)));

const putLayout = (request: HttpRequest) =>
  Effect.gen(function* () {
    const raw = yield* request.body;
    const layout = decodeLayoutJson(raw);
    if (Either.isLeft(layout)) {
      return yield* new BadRequest({ message: layout.left });
    }
    yield* writeLayout(layout.right);
    return { status: 204, headers: {}, body: null } satisfies HttpResponse;
  });

const decodeBody = <A, I>(schema: Schema.Schema<A, I>, raw: string) => {
  const parsed = Either.try(() => JSON.parse(raw) as unknown);
  const decoded = Either.flatMap(
    Either.mapLeft(parsed, () => "The body isn't JSON"),
    (value) => Either.mapLeft(Schema.decodeUnknownEither(schema)(value), (e) => e.message),
  );
  return Either.isLeft(decoded)
    ? Effect.fail(new BadRequest({ message: decoded.left }))
    : Effect.succeed(decoded.right);
};

const geocodeBatch = (request: HttpRequest) =>
  Effect.gen(function* () {
    const { addresses } = yield* decodeBody(BatchRequest, yield* request.body);
    const io = yield* ServerIo;
    const answer = addresses.length === 0 ? "" : yield* io.geocodeBatch(censusBatchCsv(addresses));
    return json({ results: parseCensusBatch(answer, addresses.length) });
  });

/** An address is tried at the Census first; cross streets and anything it doesn't know, at Nominatim. */
const geocodePlace = (request: HttpRequest) =>
  Effect.gen(function* () {
    const { query } = yield* decodeBody(PlaceRequest, yield* request.body);
    const io = yield* ServerIo;
    const census = parseCensusOneLine(yield* io.geocodeOneLine(query));
    const found = census ?? parseNominatim(yield* io.geocodeNominatim(query));
    return found === null ? text(404, "No match for that place") : json(found);
  });

const route = (
  request: HttpRequest,
  site: Site,
): Effect.Effect<HttpResponse, RouteError, ServerIo> => {
  const { pathname } = request.url;
  const isRead = request.method === "GET" || request.method === "HEAD";

  if (pathname === "/" && isRead) {
    return Effect.succeed({
      status: 302,
      headers: { location: "/web/app" },
      body: null,
    });
  }
  if ((pathname === "/web/app" || pathname === "/web/app/") && isRead) {
    return Effect.succeed({
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
      body: page(site.buildId, site.assistantPort),
    });
  }
  if (pathname === "/api/geocode/batch" || pathname === "/api/geocode/place") {
    if (request.method !== "POST") {
      return Effect.succeed(methodNotAllowed("POST"));
    }
    return pathname === "/api/geocode/batch" ? geocodeBatch(request) : geocodePlace(request);
  }
  if (pathname.startsWith(widgetAssetsPath) && isRead) {
    return serveWidgetFile(
      pathname.slice(widgetAssetsPath.length),
      request.url.searchParams.has("v"),
    );
  }
  if (pathname.startsWith(assetsPath) && isRead) {
    const asset = site.assets.get(pathname.slice(assetsPath.length));
    if (asset === undefined) {
      return Effect.succeed(text(404, "Not found"));
    }
    return Effect.succeed({
      status: 200,
      headers: { "content-type": asset.contentType, "cache-control": "no-cache" },
      body: asset.body,
    });
  }
  if (isWidgetApiRequest(request)) {
    return handleWidgetApis(request, widgetApis);
  }
  if (pathname === "/api/layout") {
    switch (request.method) {
      case "GET":
        return getLayout;
      case "PUT":
        return putLayout(request);
      default:
        return Effect.succeed(methodNotAllowed("GET, PUT"));
    }
  }
  return Effect.succeed(text(404, "Not found"));
};

export const handle = (
  request: HttpRequest,
  site: Site,
): Effect.Effect<HttpResponse, never, ServerIo> => {
  if (!site.hosts.has(request.url.host)) {
    return Effect.succeed(text(421, "Misdirected request"));
  }
  const crossOrigin = request.origin !== null &&
    request.origin !== request.url.origin;
  if (crossOrigin) {
    return Effect.succeed(text(403, "Cross-origin requests are not allowed"));
  }
  return route(request, site).pipe(
    Effect.catchTags({
      BadRequest: (e) => Effect.succeed(text(400, e.message)),
      CorruptData: (e) => Effect.succeed(text(500, e.message)),
      IoError: (e) => Effect.succeed(text(500, String(e.cause))),
    }),
  );
};
