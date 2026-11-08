import { assertEquals } from "@std/assert";
import { assess } from "./coverage.ts";

const at = (lat: number, lon: number) => ({ lat, lon });
// About 69 miles per degree of latitude.
const north = { label: "North", at: at(40, -105), miles: 10 };
const south = { label: "South", at: at(39, -105), miles: 30 };

const leads = [
  { item: "near north", at: at(40.05, -105) },
  { item: "gap", at: at(39.45, -105) },
  { item: "south reach", at: at(39.2, -105) },
];

Deno.test("assess finds each lead's nearest reaching teacher, and who isn't covered", () => {
  const result = assess(leads, [north, south]);
  assertEquals(
    result.map((r) => [r.item, r.nearest?.teacher.label, r.covered]),
    [
      ["near north", "North", true],
      ["south reach", "South", true],
      ["gap", "South", false],
    ],
  );
});

Deno.test("a farther teacher with a bigger radius can cover a lead the nearer one can't", () => {
  const small = { label: "Small", at: at(39.5, -105), miles: 1 };
  const big = { label: "Big", at: at(39.0, -105), miles: 60 };
  const [r] = assess([{ item: "x", at: at(39.52, -105) }], [small, big]);
  assertEquals([r?.nearest?.teacher.label, r?.covered], ["Big", true]);
});

Deno.test("with no teachers every lead is covered and has no nearest teacher", () => {
  const result = assess(leads, []);
  assertEquals(result.map((r) => [r.nearest, r.covered]), [[null, true], [null, true], [
    null,
    true,
  ]]);
  assertEquals(result.length, 3);
});

Deno.test("assess lists every teacher who reaches a lead, nearest first", () => {
  const near = { label: "Near", at: at(39.5, -105), miles: 5 };
  const mid = { label: "Mid", at: at(39.4, -105), miles: 20 };
  const far = { label: "Far", at: at(38, -105), miles: 20 };
  const [r] = assess([{ item: "x", at: at(39.52, -105) }], [far, mid, near]);
  assertEquals(r?.reaching.map((d) => d.teacher.label), ["Near", "Mid"]);
  assertEquals(assess([{ item: "y", at: at(30, -105) }], [near])[0]?.reaching, []);
});
