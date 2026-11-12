/** The outside services every map widget sends data to, as the consent form lists them. */
import type { Permissions } from "../../../common/widgets.ts";

/**
 * The permissions of a widget that places addresses on a map. `source` says where the
 * addresses come from, e.g. "the CSV you load".
 */
export const mapPermissions = (source: string): Permissions => ({
  services: [
    {
      name: "US Census Geocoder",
      sends: `The street, city, state and zip of every address in ${source} (not the names or ` +
        "other columns), and each starting address you type, to find their coordinates. It's " +
        "sent through this app's server, which doesn't keep it. The coordinates are saved only " +
        "in this browser.",
      privacyPolicy: "https://www.census.gov/about/policies/privacy/privacy-policy.html",
      terms: "https://www.census.gov/data/developers/about/terms-of-service.html",
    },
    {
      name: "OpenStreetMap Nominatim",
      sends: "A starting address or cross streets you type, only when the Census Geocoder " +
        "can't find it (it knows cross streets). It never gets addresses from files.",
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
});
