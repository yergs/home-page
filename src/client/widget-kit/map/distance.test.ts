import { assertAlmostEquals, assertEquals } from "@std/assert";
import { driveMinutes, formatDrive, milesBetween, within } from "./distance.ts";

const denver = { lat: 39.7392, lon: -104.9903 };
const boulder = { lat: 40.015, lon: -105.2705 };

Deno.test("milesBetween matches the known Denver to Boulder distance, and is symmetric", () => {
  assertAlmostEquals(milesBetween(denver, boulder), 24.2, 0.3);
  assertEquals(milesBetween(denver, boulder), milesBetween(boulder, denver));
  assertEquals(milesBetween(denver, denver), 0);
});

Deno.test("within keeps places in reach, nearest first", () => {
  const places = [
    { item: "far", at: { lat: 41, lon: -105 } },
    { item: "boulder", at: boulder },
    { item: "here", at: denver },
  ];
  assertEquals(within(places, denver, 30).map((p) => p.item), ["here", "boulder"]);
  assertEquals(within(places, denver, 1).map((p) => p.item), ["here"]);
});

Deno.test("driveMinutes assumes roads 30% longer than the line, at 30 mph", () => {
  assertEquals(driveMinutes(0), 0);
  assertEquals(driveMinutes(0.1), 1);
  assertEquals(driveMinutes(10), 26);
  assertEquals(driveMinutes(24.2), 63);
});

Deno.test("formatDrive reads as minutes, or hours and minutes", () => {
  assertEquals(formatDrive(26), "26 min");
  assertEquals(formatDrive(63), "1 hr 3 min");
  assertEquals(formatDrive(120), "2 hr");
});
