/**
 * Imperative shell of the webserver: wires real I/O into the core in
 * routes.ts and starts an HTTPS (HTTP/2-capable) server on localhost only.
 */
import { Effect } from "effect";
import { bundleClient, BundlerIo, BundlerIoLive } from "../../tooling/bundle-client.ts";
import { config } from "./config.ts";
import {
  type Bytes,
  type HttpGot,
  type HttpRequest,
  type HttpResponse,
  IoError,
  maxHttpGetBytes,
  ServerIo,
} from "./http.ts";
import { handle } from "./routes.ts";
import { ttlCache } from "./ttl-cache.ts";

/** Wraps a promise-returning call as an Effect that fails with IoError. */
const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

/** A body, read up to `max` bytes: null if there's more. */
const readCapped = async (body: ReadableStream<Uint8Array> | null, max: number) => {
  if (body === null) return new Uint8Array(0);
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > max) {
      await body.cancel();
      return null;
    }
    chunks.push(chunk);
  }
  const all: Bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return all;
};

/** One GET, not following redirects, given 15 seconds. */
const get = async (url: string): Promise<HttpGot> => {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent": "home-page-feeds/1",
      accept: "application/rss+xml, application/atom+xml, application/feed+json, " +
        "application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5",
    },
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    body: await readCapped(response.body, maxHttpGetBytes),
  };
};

// Every widget and tab showing a feed asks for it; this asks its site once in five minutes.
const cachedGet = ttlCache<HttpGot>(5 * 60_000, 200);

const censusUrl = "https://geocoding.geo.census.gov/geocoder/locations";

/** A geocoder's answer as text; a failure status becomes an error, so it isn't read as no match. */
const responseText = (response: Response): Promise<string> => {
  if (!response.ok) {
    return Promise.reject(new Error(`The geocoder answered ${response.status}`));
  }
  return response.text();
};

const io = ServerIo.of({
  readLayoutFile: Effect.tryPromise({
    try: () => Deno.readTextFile(config.layoutFile),
    catch: (cause) => new IoError({ cause }),
  }),
  writeLayoutTempFile: (text) =>
    Effect.tryPromise({
      try: () => Deno.writeTextFile(config.layoutTempFile, text),
      catch: (cause) => new IoError({ cause }),
    }),
  commitLayoutTempFile: Effect.tryPromise({
    try: () => Deno.rename(config.layoutTempFile, config.layoutFile),
    catch: (cause) => new IoError({ cause }),
  }),
  readWidgetFile: (path) => attempt(() => Deno.readFile(`${config.widgetsOutDir}/${path}`)),
  httpGet: (url) => attempt(() => cachedGet(url, () => get(url))),
  geocodeBatch: (csv) =>
    attempt(async () => {
      const form = new FormData();
      form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
      form.append("benchmark", "Public_AR_Current");
      const response = await fetch(`${censusUrl}/addressbatch`, { method: "POST", body: form });
      return responseText(response);
    }),
  geocodeOneLine: (query) =>
    attempt(async () =>
      responseText(
        await fetch(
          `${censusUrl}/onelineaddress?${new URLSearchParams({
            address: query,
            benchmark: "Public_AR_Current",
            format: "json",
          })}`,
        ),
      )
    ),
  geocodeNominatim: (query) =>
    attempt(async () =>
      responseText(
        await fetch(
          `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
            q: query,
            format: "json",
            limit: "1",
            countrycodes: "us",
          })}`,
          { headers: { "user-agent": "home-page-radius-map (personal, localhost)" } },
        ),
      )
    ),
});

const toHttpRequest = (request: Request): HttpRequest => ({
  method: request.method,
  url: new URL(request.url),
  origin: request.headers.get("origin"),
  body: attempt(() => request.text()),
});

const toResponse = (response: HttpResponse): Response =>
  new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });

// In its own process, so each build imports widgets' manifests afresh. Its
// output and any errors go to the server's log; a failed build leaves the last
// good one in place.
await new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--allow-read",
    `--allow-write=${config.distDir}`,
    "--allow-env",
    config.widgetBuildScript,
  ],
  stdout: "inherit",
  stderr: "inherit",
}).output();

const bundle = await Effect.runPromise(
  bundleClient(config.clientEntry, config.sharedEntries).pipe(
    Effect.provideService(BundlerIo, BundlerIoLive),
  ),
);

const site = {
  hosts: config.hosts,
  buildId: bundle.buildId,
  assistantPort: config.assistant.port,
  assets: new Map(bundle.assets),
};

Deno.serve(
  {
    hostname: config.hostname,
    port: config.port,
    cert: await Deno.readTextFile(config.certFile),
    key: await Deno.readTextFile(config.keyFile),
    onListen: () => console.log(`Serving ${config.appUrl}`),
  },
  (request) =>
    Effect.runPromise(
      handle(toHttpRequest(request), site).pipe(
        Effect.provideService(ServerIo, io),
        Effect.map(toResponse),
      ),
    ),
);
