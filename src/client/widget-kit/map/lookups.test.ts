import { assertEquals } from "@std/assert";
import { chunks, lookupsNeeded } from "./lookups.ts";

const a = (street: string, city = "Town") => ({ street, city, state: "CO", zip: "" });

Deno.test("lookupsNeeded skips known, unlookable and repeated addresses", () => {
  const needed = lookupsNeeded(
    [a("1 Main"), a("1 MAIN"), a("2 Main"), a(""), a("3 Main", ""), a("4 Main")],
    { "2 main|town|co|": { lat: 1, lon: 2 }, "4 main|town|co|": null },
  );
  assertEquals(needed.map((n) => n.key), ["1 main|town|co|"]);
});

Deno.test("chunks splits into runs of at most the size", () => {
  assertEquals(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunks([], 2), []);
});
