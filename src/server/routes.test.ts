import { defaultSchedule } from "../common/day-cycle.ts";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect } from "effect";
import { defaultLayout, type Layout, newColumn } from "../common/model.ts";
import {
  contentTypeFor,
  type HttpRequest,
  type HttpResponse,
  IoError,
  ServerIo,
  type Site,
} from "./http.ts";
import { handle, page } from "./routes.ts";

const site: Site = {
  hosts: new Set(["localhost:8443"]),
  assets: new Map([["main.js", {
    contentType: "text/javascript",
    body: new TextEncoder().encode("js"),
  }]]),
  buildId: "abc",
  assistantPort: 9443,
};

const request = (
  method: string,
  path: string,
  options: { body?: string; origin?: string; host?: string } = {},
): HttpRequest => ({
  method,
  url: new URL(path, `https://${options.host ?? "localhost:8443"}`),
  origin: options.origin ?? null,
  body: Effect.succeed(options.body ?? ""),
});

const unused = Effect.die("unexpected I/O");

const noIo = ServerIo.of({
  readLayoutFile: unused,
  writeLayoutTempFile: () => unused,
  commitLayoutTempFile: unused,
  readWidgetFile: () => unused,
  httpGet: () => unused,
  geocodeBatch: () => unused,
  geocodeOneLine: () => unused,
  geocodeNominatim: () => unused,
});

const run = (req: HttpRequest, io = noIo): Promise<HttpResponse> =>
  Effect.runPromise(
    handle(req, site).pipe(
      Effect.provideService(ServerIo, io),
    ),
  );

const layout: Layout = {
  version: 1,
  schedule: defaultSchedule,
  columns: [newColumn("c", "LuStar")],
};

Deno.test("/ redirects to the app", async () => {
  const res = await run(request("GET", "/"));
  assertEquals([res.status, res.headers["location"]], [302, "/web/app"]);
});

Deno.test("/web/app serves the page", async () => {
  for (const path of ["/web/app", "/web/app/"]) {
    const res = await run(request("GET", path));
    assertEquals(res.status, 200);
    assertEquals(res.body, page("abc", 9443));
  }
  assertStringIncludes(page("abc", 9443), `src="/web/assets/main.js?v=abc"`);
  // Widgets import the shared packages by name; the import map points them at the page's copies.
  assertStringIncludes(
    page("abc", 9443),
    `<script type="importmap">{"imports":{"react":"/web/assets/shared/react.js",`,
  );
  // The page tells the client where the assistant service is.
  assertStringIncludes(page("abc", 9443), `<meta name="assistant-port" content="9443">`);
});

Deno.test("/web/assets serves known assets and 404s otherwise", async () => {
  const hit = await run(request("GET", "/web/assets/main.js"));
  assertEquals([hit.status, hit.headers["content-type"]], [200, "text/javascript"]);
  const miss = await run(request("GET", "/web/assets/nope.js"));
  assertEquals(miss.status, 404);
});

Deno.test("unknown paths and methods 404", async () => {
  assertEquals((await run(request("GET", "/elsewhere"))).status, 404);
  assertEquals((await run(request("POST", "/web/app"))).status, 404);
});

Deno.test("rejects unknown hosts (DNS rebinding)", async () => {
  const res = await run(request("GET", "/web/app", { host: "evil.test:8443" }));
  assertEquals(res.status, 421);
});

Deno.test("rejects cross-origin requests", async () => {
  const res = await run(
    request("PUT", "/api/layout", { origin: "https://evil.test" }),
  );
  assertEquals(res.status, 403);
  const same = await run(
    request("GET", "/", { origin: "https://localhost:8443" }),
  );
  assertEquals(same.status, 302);
});

Deno.test("GET /api/layout returns the stored layout", async () => {
  const res = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.succeed(JSON.stringify(layout)),
  });
  assertEquals([res.status, res.body], [200, JSON.stringify(layout)]);
});

Deno.test("GET /api/layout returns the default layout when none is stored", async () => {
  const res = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.fail(
      new IoError({ cause: new Deno.errors.NotFound("gone") }),
    ),
  });
  assertEquals([res.status, res.body], [200, JSON.stringify(defaultLayout)]);
});

Deno.test("GET /api/layout reports read failures and corrupt data", async () => {
  const failed = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.fail(new IoError({ cause: "disk on fire" })),
  });
  assertEquals([failed.status, failed.body], [500, "disk on fire"]);
  const corrupt = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.succeed(`{"version": 2}`),
  });
  assertEquals(corrupt.status, 500);
  assertStringIncludes(String(corrupt.body), "Stored layout is invalid");
});

Deno.test("PUT /api/layout validates, writes, then commits", async () => {
  const calls: Array<string> = [];
  const res = await run(
    request("PUT", "/api/layout", { body: JSON.stringify(layout) }),
    {
      ...noIo,
      writeLayoutTempFile: (text) => Effect.sync(() => void calls.push(`write ${text}`)),
      commitLayoutTempFile: Effect.sync(() => void calls.push("commit")),
    },
  );
  assertEquals(res.status, 204);
  assertEquals(calls, [`write ${JSON.stringify(layout, null, 2)}\n`, "commit"]);
});

Deno.test("PUT /api/layout rejects malformed JSON and invalid layouts", async () => {
  const notJson = await run(request("PUT", "/api/layout", { body: "{" }));
  assertEquals(notJson.status, 400);
  const invalid = await run(
    request("PUT", "/api/layout", { body: `{"version":1}` }),
  );
  assertEquals(invalid.status, 400);
});

Deno.test("/api/layout rejects other methods", async () => {
  const res = await run(request("DELETE", "/api/layout"));
  assertEquals([res.status, res.headers["allow"]], [405, "GET, PUT"]);
});

Deno.test("/api/backgrounds is gone", async () => {
  assertEquals((await run(request("GET", "/api/backgrounds"))).status, 404);
});

Deno.test("contentTypeFor maps known extensions", () => {
  assertEquals(contentTypeFor("a.js"), "text/javascript; charset=utf-8");
  assertEquals(contentTypeFor("a.css"), "text/css; charset=utf-8");
  assertEquals(contentTypeFor("a.js.map"), "application/json; charset=utf-8");
  assertEquals(contentTypeFor("a.json"), "application/json; charset=utf-8");
  assertEquals(contentTypeFor("a.png"), "image/png");
  assertEquals(contentTypeFor("a.jpg"), "image/jpeg");
  assertEquals(contentTypeFor("a.JPEG"), "image/jpeg");
  assertEquals(contentTypeFor("a.gif"), "image/gif");
  assertEquals(contentTypeFor("a.avif"), "image/avif");
  assertEquals(contentTypeFor("a.webp"), "image/webp");
  assertEquals(contentTypeFor("a.svg"), "image/svg+xml");
  assertEquals(contentTypeFor("a.bin"), "application/octet-stream");
});

Deno.test("the assistant isn't served here: it's its own service", async () => {
  const res = await run(request("POST", "/api/assistant"));
  assertEquals(res.status, 404);
});

const widgetIo = (files: ReadonlyMap<string, string>) => ({
  ...noIo,
  readWidgetFile: (path: string) => {
    const file = files.get(path);
    return file === undefined
      ? Effect.fail(new IoError({ cause: new Deno.errors.NotFound(path) }))
      : Effect.succeed(new TextEncoder().encode(file));
  },
});

Deno.test("GET /web/assets/widgets/ serves the widget build's output from disk", async () => {
  const io = widgetIo(new Map([["clock/main.js", "js"], ["registry.json", "{}"]]));
  const bundle = await run(request("GET", "/web/assets/widgets/clock/main.js?v=abc"), io);
  assertEquals(bundle.status, 200);
  assertEquals(bundle.headers["content-type"], "text/javascript; charset=utf-8");
  assertEquals(bundle.headers["cache-control"], "public, max-age=31536000, immutable");
  assertEquals(new TextDecoder().decode(bundle.body as Uint8Array), "js");

  const unversioned = await run(request("GET", "/web/assets/widgets/clock/main.js"), io);
  assertEquals(unversioned.headers["cache-control"], "no-cache");

  const registry = await run(request("GET", "/web/assets/widgets/registry.json?v=1"), io);
  assertEquals(registry.headers["content-type"], "application/json; charset=utf-8");
  assertEquals(registry.headers["cache-control"], "no-cache");
});

Deno.test("GET /web/assets/widgets/ 404s for missing files, and never reads other paths", async () => {
  const io = widgetIo(new Map());
  for (
    const path of [
      "gone/main.js",
      "../../.secrets/localhost-key.pem",
      "clock/../../x/main.js",
      "clock/other.js",
      "Clock/main.js",
    ]
  ) {
    assertEquals((await run(request("GET", `/web/assets/widgets/${path}`), io)).status, 404);
  }
});

const geocodeIo = (calls: Array<string>, answers: {
  batch?: string;
  oneLine?: string;
  nominatim?: string;
}) =>
  ServerIo.of({
    ...noIo,
    geocodeBatch: (csv) => Effect.sync(() => (calls.push(`batch ${csv}`), answers.batch ?? "")),
    geocodeOneLine: (q) => Effect.sync(() => (calls.push(`census ${q}`), answers.oneLine ?? "{}")),
    geocodeNominatim: (q) => Effect.sync(() => (calls.push(`osm ${q}`), answers.nominatim ?? "[]")),
  });

Deno.test("a widget's full page is served as the app shell", async () => {
  const res = await run(request("GET", "/web/widget/radius-map"));
  assertEquals([res.status, res.body], [200, page("abc", 9443)]);
  assertEquals((await run(request("GET", "/web/widget/Bad_Id"))).status, 404);
});

Deno.test("/api/geocode/batch geocodes addresses, in order, nulling non-matches", async () => {
  const calls: Array<string> = [];
  const body = JSON.stringify({
    addresses: [
      { street: "1 Main St", city: "Town", state: "CO", zip: "80000" },
      { street: "2 Nowhere", city: "Town", state: "CO", zip: "80000" },
    ],
  });
  const res = await run(
    request("POST", "/api/geocode/batch", { body }),
    geocodeIo(calls, { batch: '"0","x","Match","Exact","y","-104.5,39.5"\n"1","x","No_Match"' }),
  );
  assertEquals(res.status, 200);
  assertEquals(JSON.parse(String(res.body)), { results: [{ lat: 39.5, lon: -104.5 }, null] });
  assertEquals(calls.length, 1);
});

Deno.test("/api/geocode/batch with no addresses calls no geocoder", async () => {
  const calls: Array<string> = [];
  const res = await run(
    request("POST", "/api/geocode/batch", { body: '{"addresses":[]}' }),
    geocodeIo(calls, {}),
  );
  assertEquals([JSON.parse(String(res.body)), calls], [{ results: [] }, []]);
});

Deno.test("/api/geocode rejects bad bodies and wrong methods", async () => {
  assertEquals((await run(request("POST", "/api/geocode/batch", { body: "nope" }))).status, 400);
  assertEquals((await run(request("POST", "/api/geocode/batch", { body: "{}" }))).status, 400);
  assertEquals(
    (await run(request("POST", "/api/geocode/place", { body: '{"query":""}' }))).status,
    400,
  );
  assertEquals((await run(request("GET", "/api/geocode/place"))).status, 405);
});

Deno.test("/api/geocode/place tries the Census, then Nominatim, then gives up", async () => {
  const census = JSON.stringify({
    result: { addressMatches: [{ matchedAddress: "1 MAIN ST", coordinates: { x: -104, y: 39 } }] },
  });
  const osm = JSON.stringify([{ lat: "39.1", lon: "-104.1", display_name: "A & B" }]);
  const ask = (answers: Parameters<typeof geocodeIo>[1], calls: Array<string> = []) =>
    run(
      request("POST", "/api/geocode/place", { body: '{"query":"1 Main St"}' }),
      geocodeIo(calls, answers),
    );

  const calls: Array<string> = [];
  const first = await ask({ oneLine: census }, calls);
  assertEquals(JSON.parse(String(first.body)), { lat: 39, lon: -104, label: "1 MAIN ST" });
  assertEquals(calls, ["census 1 Main St"]);

  const second = await ask({ nominatim: osm });
  assertEquals(JSON.parse(String(second.body)), { lat: 39.1, lon: -104.1, label: "A & B" });

  assertEquals((await ask({})).status, 404);
});
