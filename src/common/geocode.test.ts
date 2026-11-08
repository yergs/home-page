import { assertEquals } from "@std/assert";
import { censusBatchCsv, parseCensusBatch, parseCensusOneLine, parseNominatim } from "./geocode.ts";

Deno.test("censusBatchCsv numbers the addresses and quotes as needed", () => {
  assertEquals(
    censusBatchCsv([
      { street: "1 Main St", city: "Town", state: "CO", zip: "80000" },
      { street: "2 A, B", city: "", state: "CO", zip: "" },
    ]),
    '0,1 Main St,Town,CO,80000\n1,"2 A, B",,CO,\n',
  );
});

Deno.test("parseCensusBatch keeps matches, in order, and nulls the rest", () => {
  const text = [
    '"1","x","No_Match"',
    '"0","1 Main St, Town, CO, 80000","Match","Exact","1 MAIN ST, TOWN, CO, 80000","-104.5,39.5","1","L"',
    '"9","x","Match","Exact","y","-1,2"',
    '"2","x","Match","Exact","y","bad"',
  ].join("\n");
  assertEquals(parseCensusBatch(text, 3), [{ lat: 39.5, lon: -104.5 }, null, null]);
});

Deno.test("parseCensusOneLine reads the first match, or none", () => {
  const found = JSON.stringify({
    result: { addressMatches: [{ matchedAddress: "1 MAIN ST", coordinates: { x: -104, y: 39 } }] },
  });
  assertEquals(parseCensusOneLine(found), { lat: 39, lon: -104, label: "1 MAIN ST" });
  assertEquals(parseCensusOneLine('{"result":{"addressMatches":[]}}'), null);
  assertEquals(parseCensusOneLine("not json"), null);
});

Deno.test("parseNominatim reads the first match, or none", () => {
  const found = JSON.stringify([{ lat: "39.1", lon: "-104.2", display_name: "A & B, Town" }]);
  assertEquals(parseNominatim(found), { lat: 39.1, lon: -104.2, label: "A & B, Town" });
  assertEquals(parseNominatim("[]"), null);
  assertEquals(parseNominatim("{}"), null);
});
