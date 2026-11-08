import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { charsetOf, decodeBody, feedsServed } from "./feeds-api.ts";
import { type HttpGot, IoError, ServerIo } from "./http.ts";
import { handleWidgetApis } from "./widget-api-routes.ts";

const rss = (title: string) =>
  `<rss><channel><title>${title}</title><item><title>One</title><link>https://a.example/1</link></item></channel></rss>`;

const answer = (status: number, body: string | null, more: Partial<HttpGot> = {}): HttpGot => ({
  status,
  location: null,
  contentType: "application/rss+xml",
  body: body === null ? null : new TextEncoder().encode(body),
  ...more,
});

/** The web, as a map from URL to its answer; a URL not in it can't be reached. */
const web = (pages: Record<string, HttpGot>) =>
  ServerIo.of({
    readLayoutFile: Effect.die("unused"),
    writeLayoutTempFile: () => Effect.die("unused"),
    commitLayoutTempFile: Effect.die("unused"),
    readWidgetFile: () => Effect.die("unused"),
    httpGet: (url) => {
      const page = pages[url];
      return page === undefined
        ? Effect.fail(new IoError({ cause: "no route" }))
        : Effect.succeed(page);
    },
    geocodeBatch: () => Effect.die("unused"),
    geocodeOneLine: () => Effect.die("unused"),
    geocodeNominatim: () => Effect.die("unused"),
  });

const read = async (pages: Record<string, HttpGot>, feedUrl: string) => {
  const response = await Effect.runPromise(
    handleWidgetApis({
      method: "POST",
      url: new URL("https://localhost/api/widget-apis/feeds/read"),
      origin: null,
      body: Effect.succeed(
        JSON.stringify({
          caller: { widgetType: "rss", widgetId: "w" },
          input: { feedUrl, limit: 5 },
        }),
      ),
    }, [feedsServed]).pipe(Effect.provideService(ServerIo, web(pages))),
  );
  return response.status === 200 ? JSON.parse(String(response.body)) : { status: response.status };
};

const errorOf = (result: { ok: boolean; error?: { is: string; message: string } }) =>
  result.ok ? null : [result.error?.is, result.error?.message];

Deno.test("a feed is read, and answered parsed", async () => {
  const result = await read(
    { "https://a.example/feed": answer(200, rss("A")) },
    "https://a.example/feed",
  );
  assertEquals(result.ok, true);
  assertEquals(result.value.title, "A");
  assertEquals(result.value.items.at(0).link, "https://a.example/1");
});

Deno.test("redirects are followed, relative ones too, up to a point", async () => {
  const moved = (location: string) => answer(301, "", { location });
  const result = await read({
    "https://a.example/old": moved("/new"),
    "https://a.example/new": moved("https://b.example/feed"),
    "https://b.example/feed": answer(200, rss("B")),
  }, "https://a.example/old");
  assertEquals(result.value.title, "B");
  const loop = await read({ "https://a.example/loop": moved("/loop") }, "https://a.example/loop");
  assertEquals(errorOf(loop), ["not-a-feed", "It redirects too many times."]);
  const elsewhere = await read(
    { "https://a.example/x": moved("file:///etc/passwd") },
    "https://a.example/x",
  );
  assertEquals(errorOf(elsewhere), [
    "not-a-feed",
    "It redirects to something that isn't a web page.",
  ]);
});

Deno.test("what isn't a feed is refused, without quoting it", async () => {
  const pages = {
    "https://a.example/page": answer(200, "<html><body>Secret stuff</body></html>"),
    "https://a.example/gone": answer(404, "Secret error page"),
    "https://a.example/huge": answer(200, null),
  };
  assertEquals(errorOf(await read(pages, "https://a.example/page")), [
    "not-a-feed",
    "That address isn't a feed (RSS, Atom or JSON Feed).",
  ]);
  assertEquals(errorOf(await read(pages, "https://a.example/gone")), [
    "not-a-feed",
    "a.example answered with an error (404), not a feed.",
  ]);
  assertEquals(errorOf(await read(pages, "https://a.example/huge")), [
    "not-a-feed",
    "It's too big to be a feed.",
  ]);
  assertEquals(errorOf(await read(pages, "https://nowhere.example/feed")), [
    "feed-unreachable",
    "Couldn't reach nowhere.example.",
  ]);
});

Deno.test("only http(s) URLs are read", async () => {
  assertEquals(await read({}, "file:///etc/passwd"), { status: 400 });
});

Deno.test("the body is decoded in the charset its type, or its XML declaration, names", () => {
  const latin1 = new Uint8Array([0x3c, 0x61, 0x3e, 0xe9, 0x3c, 0x2f, 0x61, 0x3e]); // <a>é</a>
  assertEquals(decodeBody("text/xml; charset=ISO-8859-1", latin1), "<a>é</a>");
  const declared = new Uint8Array([
    ...new TextEncoder().encode('<?xml version="1.0" encoding="windows-1252"?><a>'),
    0x93,
    ...new TextEncoder().encode("</a>"),
  ]);
  assertEquals(charsetOf("application/xml", declared), "windows-1252");
  assertEquals(decodeBody(null, declared).includes("“"), true);
  assertEquals(decodeBody("text/xml; charset=bogus", new TextEncoder().encode("é")), "é");
  assertEquals(charsetOf(null, new TextEncoder().encode("{}")), "utf-8");
});
