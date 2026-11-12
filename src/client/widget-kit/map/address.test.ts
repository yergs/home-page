import { assertEquals } from "@std/assert";
import { addressKey, isLookable } from "./address.ts";

Deno.test("isLookable needs a street and a city or zip", () => {
  const a = { street: "1 Main", city: "", state: "", zip: "" };
  assertEquals(isLookable(a), false);
  assertEquals(isLookable({ ...a, zip: "80000" }), true);
  assertEquals(isLookable({ ...a, city: "Town" }), true);
  assertEquals(isLookable({ ...a, street: "", city: "Town" }), false);
});

Deno.test("addressKey ignores case and spacing", () => {
  assertEquals(
    addressKey({ street: " 1  MAIN st", city: "Town", state: "CO", zip: "80000" }),
    addressKey({ street: "1 main ST", city: "town", state: "co", zip: "80000" }),
  );
});
