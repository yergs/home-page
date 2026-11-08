import { assertEquals } from "@std/assert";
import { parseCsv, toCsv } from "./csv.ts";

Deno.test("parseCsv reads plain rows, CRLF and a BOM, skipping blank lines", () => {
  assertEquals(parseCsv("﻿a,b\r\n1,2\r\n\r\n3,4"), [["a", "b"], ["1", "2"], ["3", "4"]]);
});

Deno.test("parseCsv reads quoted commas, quotes and newlines", () => {
  assertEquals(parseCsv('"Smith, J","say ""hi""","two\nlines"\n,x'), [
    ["Smith, J", 'say "hi"', "two\nlines"],
    ["", "x"],
  ]);
});

Deno.test("parseCsv of nothing is no rows", () => {
  assertEquals(parseCsv(""), []);
});

Deno.test("toCsv quotes only what needs it, and round-trips", () => {
  const rows = [["a", "b,c"], ['q"', "line\nbreak"]];
  assertEquals(toCsv(rows), 'a,"b,c"\n"q""","line\nbreak"\n');
  assertEquals(parseCsv(toCsv(rows)), rows);
  assertEquals(toCsv([]), "");
});
