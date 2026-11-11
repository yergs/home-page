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
  permissions: {
    services: [
      {
        name: "US Census Geocoder",
        sends:
          "The street, city, state and zip of every address in the CSV you load (not the names or " +
          "other columns), and each teacher's starting address, to find their coordinates. It's " +
          "sent through this app's server, which doesn't keep it. The coordinates are saved only " +
          "in this browser.",
        privacyPolicy: "https://www.census.gov/about/policies/privacy/privacy-policy.html",
        terms: "https://www.census.gov/data/developers/about/terms-of-service.html",
      },
      {
        name: "OpenStreetMap Nominatim",
        sends: "A teacher's starting address or cross streets, only when the Census Geocoder " +
          "can't find it (it knows cross streets). It never gets addresses from the CSV.",
        privacyPolicy: "https://osmfoundation.org/wiki/Privacy_Policy",
        terms: "https://operations.osmfoundation.org/policies/nominatim/",
      },
      {
        name: "OpenStreetMap map tiles",
        sends: "Which part of the map you're looking at, as the map's picture tiles are loaded. " +
          "Your browser also sends its IP address. No addresses or names.",
        privacyPolicy: "https://osmfoundation.org/wiki/Privacy_Policy",
        terms: "https://operations.osmfoundation.org/policies/tiles/",
      },
    ],
  },
});
