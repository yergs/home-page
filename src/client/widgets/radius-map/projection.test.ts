import { assertAlmostEquals, assertEquals } from "@std/assert";
import {
  circleCorners,
  fitView,
  fromWorld,
  minZoom,
  pixelsPerMile,
  tileSize,
  toScreen,
  toWorld,
  visibleTiles,
} from "./projection.ts";

const denver = { lat: 39.7392, lon: -104.9903 };

Deno.test("toWorld and fromWorld are inverses, and the origin is the top left", () => {
  const back = fromWorld(toWorld(denver, 10), 10);
  assertAlmostEquals(back.lat, denver.lat, 1e-6);
  assertAlmostEquals(back.lon, denver.lon, 1e-6);
  assertEquals(toWorld({ lat: 0, lon: 0 }, 0), { x: tileSize / 2, y: tileSize / 2 });
  assertAlmostEquals(toWorld({ lat: 90, lon: -180 }, 0).y, 0, 0.01);
});

Deno.test("a mile is about 55 pixels across at zoom 12 near Denver, and doubles per zoom", () => {
  const z12 = pixelsPerMile(denver.lat, 12);
  assertAlmostEquals(z12, 54.8, 0.2);
  assertAlmostEquals(pixelsPerMile(denver.lat, 13), z12 * 2, 1e-9);
});

Deno.test("fitView centers on the places and zooms in as far as fits", () => {
  const empty = fitView([], 800, 600);
  assertEquals(empty.zoom, minZoom + 1);
  const one = fitView([denver], 800, 600);
  assertEquals(one, { center: denver, zoom: 18 });
  const two = fitView([denver, { lat: 40.015, lon: -105.2705 }], 800, 600);
  assertEquals(two.zoom, 10);
  assertAlmostEquals(two.center.lat, 39.877, 0.001);
  assertEquals(fitView([{ lat: -80, lon: -179 }, { lat: 80, lon: 179 }], 10, 10).zoom, minZoom);
});

Deno.test("circleCorners spans the circle's miles each way", () => {
  const [nw, se] = circleCorners(denver, 10);
  assertAlmostEquals((nw?.lat ?? 0) - denver.lat, 10 / 69, 1e-9);
  assertEquals(nw?.lon !== undefined && nw.lon < denver.lon, true);
  assertEquals(se?.lat !== undefined && se.lat < denver.lat, true);
});

Deno.test("toScreen puts the view's center in the middle of it", () => {
  const view = { center: denver, zoom: 12 };
  assertEquals(toScreen(denver, view, 800, 600), { x: 400, y: 300 });
  assertEquals(toScreen({ lat: denver.lat, lon: denver.lon + 0.01 }, view, 800, 600).x > 400, true);
});

Deno.test("visibleTiles covers the view, wrapping around the world and stopping at the poles", () => {
  const view = { center: denver, zoom: 12 };
  const tiles = visibleTiles(view, 800, 600);
  const left = Math.min(...tiles.map((t) => t.left));
  const top = Math.min(...tiles.map((t) => t.top));
  assertEquals([left <= 0 && left > -tileSize, top <= 0 && top > -tileSize], [true, true]);
  assertEquals(Math.max(...tiles.map((t) => t.left)) + tileSize >= 800, true);
  // Near the antimeridian, the tile numbers wrap instead of going out of range.
  const wrapped = visibleTiles({ center: { lat: 0, lon: 179.9 }, zoom: 3 }, 800, 400);
  assertEquals(wrapped.every((t) => t.x >= 0 && t.x < 8), true);
  assertEquals(wrapped.some((t) => t.x === 0), true);
  // Past the top of the map there are no tiles.
  const polar = visibleTiles({ center: { lat: 85, lon: 0 }, zoom: 2 }, 400, 800);
  assertEquals(polar.every((t) => t.y >= 0 && t.y < 4), true);
});
