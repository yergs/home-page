import { assertEquals } from "@std/assert";
import { bestSlot, type Booked, describeFit, fitsFor, reachedBy, reaches } from "./fit.ts";

const at = (lat: number) => ({ lat, lon: -105 });
const pm = (h: number, m = 0) => (h + 12) * 60 + m;
const cls = (
  name: string,
  lat: number | null,
  start: number | null,
  end: number | null,
): Booked => ({
  name,
  at: lat === null ? null : at(lat),
  start,
  end,
});
// 0.1 degrees of latitude is about 6.9 miles: an 18 minute estimated drive.
const day: ReadonlyArray<Booked> = [
  cls("Ann", 40, pm(4), pm(4, 30)),
  cls("Ben", 40.2, pm(6), pm(6, 30)),
];

Deno.test("bestSlot fits between two classes, with the extra driving and the earliest start", () => {
  const slot = bestSlot(at(40.1), day, 30);
  assertEquals(slot, { after: "Ann", before: "Ben", detour: 18 + 18 - 36, startsAt: pm(4, 48) });
});

Deno.test("a gap too small for the drive and the lesson isn't used; the day's ends are", () => {
  const tight = [cls("Ann", 40, pm(4), pm(4, 30)), cls("Ben", 40.2, pm(5), pm(5, 30))];
  // Between would need 18 + 30 + 18 minutes in a 30 minute gap, so only an end of the day fits.
  const slot = bestSlot(at(40.1), tight, 30);
  assertEquals(slot?.after === null || slot?.before === null, true);
  assertEquals(slot?.detour, 18);
});

Deno.test("a lead at the same place as a class adds no driving", () => {
  assertEquals(bestSlot(at(40), [cls("Ann", 40, pm(4), pm(4, 30))], 30)?.detour, 0);
});

Deno.test("classes with no place or time can't be fit around", () => {
  assertEquals(
    bestSlot(at(40.1), [cls("X", null, pm(4), pm(5)), cls("Y", 40, null, null)], 30),
    null,
  );
  assertEquals(bestSlot(at(40.1), [], 30), null);
});

Deno.test("fitsFor lists each teacher's best day, least driving first, and honors range", () => {
  const near = {
    teacher: "Near",
    home: at(40.05),
    miles: 10,
    days: [
      { day: "Mon" as const, booked: day },
      { day: "Thu" as const, booked: [cls("Cy", 40.15, pm(4), pm(4, 30))] },
    ],
  };
  const far = {
    teacher: "Far",
    home: at(41),
    miles: 5,
    days: [{ day: "Tue" as const, booked: day }],
  };
  const free = {
    teacher: "Free",
    home: null,
    miles: 0,
    days: [{ day: "Wed" as const, booked: day }],
  };
  const fits = fitsFor(at(40.1), [near, far, free], 30);
  // Monday and Wednesday fit between Ann and Ben with no extra driving; Thursday adds a drive.
  assertEquals(fits.map((f) => [f.teacher, f.day, f.detour]), [
    ["Near", "Mon", 0],
    ["Free", "Wed", 0],
    ["Near", "Thu", 9],
  ]);
  assertEquals(reachedBy(at(40.1), [near, far, free]), ["Near"]);
  assertEquals([reaches(near, at(40.1)), reaches(far, at(40.1)), reaches(free, at(40.1))], [
    true,
    false,
    null,
  ]);
});

Deno.test("describeFit says where, when and how much extra driving", () => {
  const base = {
    teacher: "T",
    day: "Mon" as const,
    after: "Ann",
    before: "Ben",
    detour: 6,
    startsAt: pm(4, 30),
  };
  assertEquals(describeFit(base), "Between Ann and Ben: could start ~4:30 PM, +6 min of driving");
  assertEquals(
    describeFit({ ...base, before: null, startsAt: null, detour: 0 }),
    "After Ann, no extra driving",
  );
  assertEquals(
    describeFit({ ...base, after: null, startsAt: null }),
    "Before Ben, +6 min of driving",
  );
  assertEquals(
    describeFit({ ...base, after: null, before: null, startsAt: null }),
    "Anywhere, +6 min of driving",
  );
});
