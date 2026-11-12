import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { defaultSchedule } from "../common/day-cycle.ts";
import { type Layout, newColumn } from "../common/model.ts";
import { type HttpRequest, IoError, ServerIo } from "./http.ts";
import { layoutServed, sameLayout } from "./layout-api.ts";
import { layoutText } from "./layout-store.ts";
import { handleWidgetApis } from "./widget-api-routes.ts";

const live: Layout = { version: 1, schedule: defaultSchedule, columns: [newColumn("a", "LuStar")] };
const next: Layout = { ...live, columns: [...live.columns, newColumn("b", "LuSun")] };

/** A layout store in memory: `stored` is what's on disk (null for nothing saved). */
const store = (stored: string | null, failWrites = false) => {
  const disk = { stored, temp: "" };
  const io = ServerIo.of({
    readLayoutFile: disk.stored === null
      ? Effect.fail(new IoError({ cause: new Deno.errors.NotFound() }))
      : Effect.sync(() => disk.stored ?? ""),
    writeLayoutTempFile: (text) =>
      failWrites ? Effect.fail(new IoError({ cause: "disk full" })) : Effect.sync(() => {
        disk.temp = text;
      }),
    commitLayoutTempFile: Effect.sync(() => {
      disk.stored = disk.temp;
    }),
    readWidgetFile: () => Effect.die("unused"),
    httpGet: () => Effect.die("unused"),
    geocodeBatch: () => Effect.die("unused"),
    geocodeOneLine: () => Effect.die("unused"),
    geocodeNominatim: () => Effect.die("unused"),
  });
  return { disk, io };
};

const post = (io: typeof ServerIo.Service, operation: string, input: unknown) => {
  const request: HttpRequest = {
    method: "POST",
    url: new URL(`https://localhost/api/widget-apis/layout/${operation}`),
    origin: null,
    body: Effect.succeed(
      JSON.stringify({ caller: { widgetType: "t", widgetId: "w" }, input }),
    ),
  };
  return Effect.runPromise(
    handleWidgetApis(request, [layoutServed]).pipe(Effect.provideService(ServerIo, io)),
  ).then((r) => ({
    status: r.status,
    body: r.status === 200 ? JSON.parse(String(r.body)) : String(r.body),
  }));
};

Deno.test("layouts are the same when they'd be saved the same", () => {
  assertEquals(sameLayout(live, { ...live }), true);
  assertEquals(sameLayout(live, next), false);
});

Deno.test("get answers with the live layout", async () => {
  const { io } = store(layoutText(live));
  assertEquals(await post(io, "get", {}), { status: 200, body: { ok: true, value: live } });
});

Deno.test("apply saves the layout when the live one is still its base", async () => {
  const { disk, io } = store(layoutText(live));
  const answer = await post(io, "apply", { base: live, layout: next });
  assertEquals(answer, { status: 200, body: { ok: true, value: next } });
  assertEquals(disk.stored, layoutText(next));
});

Deno.test("apply refuses when the live layout is unreadable", async () => {
  const answer = await post(store("[]").io, "apply", { base: live, layout: next });
  assertEquals(answer.body.error.is, "layout-unreadable");
});

Deno.test("apply refuses when the live layout changed since its base", async () => {
  const { disk, io } = store(layoutText(next));
  const answer = await post(io, "apply", { base: live, layout: live });
  assertEquals(answer.body.ok, false);
  assertEquals(answer.body.error.is, "layout-changed");
  assertEquals(disk.stored, layoutText(next));
});

Deno.test("apply fails, saying why, when the layout can't be read or saved", async () => {
  const corrupt = await post(store("{").io, "get", {});
  assertEquals(corrupt.body.error.is, "layout-unreadable");
  const unreadable = store(layoutText(live));
  const failing = { ...unreadable.io, readLayoutFile: Effect.fail(new IoError({ cause: "gone" })) };
  assertEquals(await post(failing, "get", {}), {
    status: 500,
    body: "Couldn't read the layout: gone",
  });
  const unsaved = store(layoutText(live), true);
  const response = await Effect.runPromise(
    handleWidgetApis({
      method: "POST",
      url: new URL("https://localhost/api/widget-apis/layout/apply"),
      origin: null,
      body: Effect.succeed(JSON.stringify({
        caller: { widgetType: "t", widgetId: "w" },
        input: { base: live, layout: next },
      })),
    }, [layoutServed]).pipe(Effect.provideService(ServerIo, unsaved.io)),
  );
  assertEquals([response.status, String(response.body)], [
    500,
    "Couldn't save the layout: disk full",
  ]);
});
