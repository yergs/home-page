import { assertEquals } from "@std/assert";
import { dayRoute, legBetween, type Stop, totalMinutes } from "./route.ts";

const stop = (
  name: string,
  lat: number | null,
  start: number | null,
  end: number | null,
): Stop<string> => ({
  item: name,
  name,
  at: lat === null ? null : { lat, lon: -105 },
  time: { day: "Mon", start, end },
});
const pm = (h: number, m = 0) => (h + 12) * 60 + m;

Deno.test("dayRoute orders classes by start time, with untimed ones last", () => {
  const route = dayRoute([
    stop("Late", 40, null, null),
    stop("Second", 40, pm(5), pm(5, 30)),
    stop("First", 40, pm(4), pm(4, 30)),
  ]);
  assertEquals(route.map((r) => r.stop.name), ["First", "Second", "Late"]);
  assertEquals(route.at(0)?.leg, null);
});

Deno.test("a leg has the straight-line miles, a drive time, and the gap before the next class", () => {
  // 0.1 degrees of latitude is about 6.9 miles: about 18 minutes at the usual estimate.
  const leg = legBetween(stop("A", 40, pm(4), pm(4, 30)), stop("B", 40.1, pm(5), pm(5, 30)));
  assertEquals(Math.round((leg?.miles ?? 0) * 10) / 10, 6.9);
  assertEquals([leg?.minutes, leg?.gap, leg?.tight], [18, 30, false]);
});

Deno.test("a drive longer than the time between classes is tight", () => {
  const leg = legBetween(stop("A", 40, pm(4), pm(4, 30)), stop("B", 40.1, pm(4, 40), pm(5)));
  assertEquals([leg?.gap, leg?.tight], [10, true]);
});

Deno.test("the same place is no drive, and an unknown place or time leaves things unknown", () => {
  const same = legBetween(stop("A", 40, pm(4), pm(4, 30)), stop("B", 40, pm(4, 30), pm(5)));
  assertEquals([same?.minutes, same?.gap, same?.tight], [0, 0, false]);
  assertEquals(legBetween(stop("A", null, pm(4), pm(4, 30)), stop("B", 40, pm(5), pm(6))), null);
  assertEquals(legBetween(stop("A", 40, null, null), stop("B", 40.1, null, null))?.gap, null);
});

Deno.test("totalMinutes adds the known drives", () => {
  const route = dayRoute([
    stop("A", 40, pm(4), pm(4, 30)),
    stop("B", 40.1, pm(5), pm(5, 30)),
    stop("C", null, pm(6), pm(6, 30)),
    stop("D", 40.2, pm(7), pm(7, 30)),
  ]);
  assertEquals(totalMinutes(route), 18);
});
