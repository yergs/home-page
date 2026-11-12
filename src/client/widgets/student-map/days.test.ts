import { assertEquals } from "@std/assert";
import { days, firstDay, parseDays, sortedDays, sundayFirst } from "./days.ts";

Deno.test("parseDays reads day names however they're abbreviated, in week order", () => {
  assertEquals(parseDays("Mon"), ["Mon"]);
  assertEquals(parseDays("Thursday, tue"), ["Tue", "Thu"]);
  assertEquals(parseDays(""), []);
  assertEquals(parseDays("Someday"), []);
});

Deno.test("sortedDays orders by the week and drops repeats", () => {
  assertEquals(sortedDays(["Thu", "Mon", "Thu"]), ["Mon", "Thu"]);
});

Deno.test("a week starting on Sunday puts Sunday first and Saturday last", () => {
  assertEquals(days.toSorted((a, b) => sundayFirst(a) - sundayFirst(b)), [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ]);
  assertEquals(firstDay(["Sat", "Wed", "Mon"]), "Mon");
  assertEquals(firstDay(["Mon", "Sun"]), "Sun");
  assertEquals(firstDay([]), null);
});
