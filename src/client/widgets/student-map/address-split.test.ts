import { assertEquals } from "@std/assert";
import { splitAddress } from "./address-split.ts";

const parts = (line: string) => {
  const a = splitAddress(line);
  return [a.street, a.city, a.state, a.zip];
};

Deno.test("splits after the street's suffix", () => {
  assertEquals(parts("12 North Pine Street Springfield CO 80000"), [
    "12 North Pine Street",
    "Springfield",
    "CO",
    "80000",
  ]);
  assertEquals(parts("9 Oak Ave. Castle Rock CO 80104-1234"), [
    "9 Oak Ave.",
    "Castle Rock",
    "CO",
    "80104",
  ]);
});

Deno.test("keeps a direction or unit after the suffix with the street", () => {
  assertEquals(parts("5 Maple Circle East Lone Tree CO 80124"), [
    "5 Maple Circle East",
    "Lone Tree",
    "CO",
    "80124",
  ]);
  assertEquals(parts("8 Elm Ave #93 Denver CO 80237"), ["8 Elm Ave #93", "Denver", "CO", "80237"]);
  assertEquals(parts("8 Elm Ave Apt 4 Denver CO 80237"), [
    "8 Elm Ave Apt 4",
    "Denver",
    "CO",
    "80237",
  ]);
});

Deno.test("a city that starts with a direction word loses it to the street; the zip still finds it", () => {
  assertEquals(parts("3 Lake Dr West Haven CO 80000"), ["3 Lake Dr West", "Haven", "CO", "80000"]);
  assertEquals(parts("3 Lake Dr Westminster CO 80000")[1], "Westminster");
});

Deno.test("uses commas when the address has them", () => {
  assertEquals(parts("77 Birch Rd, Apt 2, Boulder, co 80301"), [
    "77 Birch Rd, Apt 2",
    "Boulder",
    "CO",
    "80301",
  ]);
});

Deno.test("without a suffix the last word is the city; without a state and zip it's all street", () => {
  assertEquals(parts("42 Broadway Denver CO 80203"), ["42 Broadway", "Denver", "CO", "80203"]);
  assertEquals(parts("42 Broadway, Denver"), ["42 Broadway, Denver", "", "", ""]);
  assertEquals(parts(""), ["", "", "", ""]);
});

Deno.test("a street named for a suffix still works", () => {
  assertEquals(parts("100 Park Ave Denver CO 80202")[0], "100 Park Ave");
  assertEquals(parts("1 Court Place Denver CO 80202")[0], "1 Court Place");
});
