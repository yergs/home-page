import { assertEquals } from "@std/assert";
import { formatSpan, formatTime, parseTime } from "./time.ts";

Deno.test("parseTime reads 12-hour and 24-hour times", () => {
  assertEquals(parseTime("4:15 PM"), 16 * 60 + 15);
  assertEquals(parseTime(" 12:00 am"), 0);
  assertEquals(parseTime("12:30pm"), 12 * 60 + 30);
  assertEquals(parseTime("16:15"), 16 * 60 + 15);
  assertEquals(parseTime("13:00 PM"), null);
  assertEquals(parseTime("4:75 PM"), null);
  assertEquals(parseTime("soon"), null);
});

Deno.test("formatTime and formatSpan write times as people do", () => {
  assertEquals(formatTime(0), "12:00 AM");
  assertEquals(formatTime(12 * 60 + 5), "12:05 PM");
  assertEquals(formatTime(16 * 60 + 15), "4:15 PM");
  assertEquals(formatSpan(16 * 60 + 15, 16 * 60 + 45), "4:15 – 4:45 PM");
  assertEquals(formatSpan(11 * 60 + 30, 12 * 60 + 15), "11:30 AM – 12:15 PM");
  assertEquals(formatSpan(16 * 60, null), "4:00 PM");
  assertEquals(formatSpan(null, null), "");
});
