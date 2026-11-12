import { defineManifest } from "../../../common/widgets.ts";
import { mapPermissions } from "../../widget-kit/map/services.ts";
import { StudentMapConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Student Map",
  description:
    "A button that opens, over the page, a map of every teacher's current students. Load each " +
    "class roll (the .txt export from the scheduling system, which lists every teacher's classes); " +
    "a teacher is added for each instructor in it; the " +
    "students' family addresses are placed on the map, each in the color of the day they have " +
    "class (a student with several days is a pie of those colors) and the shape of their " +
    "teacher, and days and teachers can be shown or hidden. A teacher's address or cross " +
    "streets and miles draw their range. Each day lists the classes in time order with the " +
    "rough drive between them. Families who aren't students yet can be added one at a time or " +
    "from a CSV, and for each the map shows which teachers' ranges reach them and where in " +
    "which teacher's day they would fit (the gap between two classes, with the least extra " +
    "driving). Files are read in the browser and never saved on a server; addresses (not " +
    "names) are sent once to the US Census geocoder to find their coordinates, and the " +
    "coordinates are kept only in this browser. The setting is just a heading.",
  config: StudentMapConfig,
  defaultConfig: { heading: "Student Map" },
  permissions: mapPermissions("the class roll you load or the families you add"),
});
