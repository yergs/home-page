import { defineManifest } from "../../../common/widgets.ts";
import { RadiusMapConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Radius Map",
  description:
    "A button that opens the map over the page (and from there, in a window of its own). " +
    "There, load a CSV of names and addresses " +
    "(street, city, state and zip in separate columns), then either show every address on a " +
    "map, or add one or more teacher locations (an address or cross streets, and miles they'll " +
    "drive) to see which addresses are in range, with rough drive times, and which are out of " +
    "every teacher's range, to find where more teachers are needed. The CSV is read in the " +
    "browser and never saved on a server; addresses are sent once to the US Census geocoder to " +
    "find their coordinates, and the coordinates are kept only in this browser. The setting is " +
    "just a heading.",
  config: RadiusMapConfig,
  defaultConfig: { heading: "Radius Map" },
});
