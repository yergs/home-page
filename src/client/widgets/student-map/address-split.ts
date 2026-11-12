/**
 * Splitting a one-line address, like "123 Main Street Denver CO 80210", into the street,
 * city, state and zip the geocoder takes. The city isn't marked off, so it's what follows
 * the street's last suffix (Street, Ave, Court...), its direction (East) and its unit (#4).
 */
import type { AddressQuery } from "../../../common/geocode.ts";

const suffixes = new Set([
  "st",
  "street",
  "ave",
  "avenue",
  "blvd",
  "boulevard",
  "dr",
  "drive",
  "ct",
  "court",
  "cir",
  "circle",
  "ln",
  "lane",
  "pl",
  "place",
  "rd",
  "road",
  "way",
  "pkwy",
  "parkway",
  "ter",
  "terrace",
  "trl",
  "trail",
  "loop",
  "pt",
  "point",
  "run",
  "row",
  "path",
  "walk",
  "hwy",
  "highway",
  "sq",
  "square",
  "cv",
  "cove",
  "xing",
  "crossing",
]);

const directions = /^(n|s|e|w|ne|nw|se|sw|north|south|east|west)$/i;
const unitWords = /^(apt|apartment|unit|ste|suite|bldg|building|#)$/i;

const bare = (word: string) => word.replaceAll(/[.,]/g, "");

/** How many of the words after the street's suffix still belong to the street. */
const trailing = (words: ReadonlyArray<string>): number => {
  let n = 0;
  // A city must be left over, so a lone "West" or "#4" at the end isn't taken.
  while (n < words.length - 1) {
    const word = bare(words[n] ?? "");
    if (directions.test(word) || word.startsWith("#")) {
      n += 1;
    } else if (unitWords.test(word) && n + 2 < words.length) {
      n += 2;
    } else {
      break;
    }
  }
  return n;
};

const noAddress: AddressQuery = { street: "", city: "", state: "", zip: "" };

/** The parts of an address, or only a street if it doesn't end with a state and zip. */
export const splitAddress = (line: string): AddressQuery => {
  const text = line.replaceAll(/\s+/g, " ").trim();
  const ends = /^(.*?)[, ]+([A-Za-z]{2})[, ]+(\d{5})(?:-\d{4})?$/.exec(text);
  if (ends === null) {
    return { ...noAddress, street: text };
  }
  const [, front = "", state = "", zip = ""] = ends;
  const commas = front.split(",").map((p) => p.trim()).filter((p) => p !== "");
  const last = commas.at(-1);
  if (commas.length > 1 && last !== undefined) {
    return {
      street: commas.slice(0, -1).join(", "),
      city: last,
      state: state.toUpperCase(),
      zip,
    };
  }
  const words = front.replaceAll(",", " ").split(" ").filter((w) => w !== "");
  // The number and first word are never the suffix: "1 Way Denver" is rare, "100 Park Ave" isn't.
  const at = words.findLastIndex((w, i) => i >= 2 && suffixes.has(bare(w).toLowerCase()));
  const streetEnd = at < 0 ? Math.max(1, words.length - 1) : at + 1 + trailing(words.slice(at + 1));
  return {
    street: words.slice(0, streetEnd).join(" "),
    city: words.slice(streetEnd).join(" "),
    state: state.toUpperCase(),
    zip,
  };
};
