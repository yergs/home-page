import { assertEquals } from "@std/assert";
import { detectMapping, rowAddress, rowName } from "./columns.ts";

Deno.test("detectMapping finds the usual header names, and each column once", () => {
  assertEquals(detectMapping(["Family Name", "Street Address", "City", "State", "Zip Code"]), {
    name: 0,
    street: 1,
    city: 2,
    state: 3,
    zip: 4,
  });
  assertEquals(detectMapping(["Parent", "Address", "Town", "ST", "Postal", "Phone"]), {
    name: 0,
    street: 1,
    city: 2,
    state: 3,
    zip: 4,
  });
});

Deno.test("detectMapping leaves unknown fields unmapped", () => {
  assertEquals(detectMapping(["x", "y"]), {
    name: null,
    street: null,
    city: null,
    state: null,
    zip: null,
  });
  // Loose matches work for long words, but "state" isn't guessed from words that merely contain it.
  assertEquals(detectMapping(["Home Street", "Estate"]).state, null);
  assertEquals(detectMapping(["Home Street", "Estate"]).street, 0);
});

Deno.test("rowAddress and rowName read a row through the mapping", () => {
  const mapping = { name: 0, street: 1, city: 2, state: null, zip: 9 };
  const row = [" Ann ", "1 Main St", "Town"];
  assertEquals(rowAddress(row, mapping), { street: "1 Main St", city: "Town", state: "", zip: "" });
  assertEquals(rowName(row, mapping), "Ann");
  assertEquals(rowName(["", "1 Main St", "Town"], mapping), "1 Main St, Town");
});
