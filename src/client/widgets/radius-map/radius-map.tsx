/** What the radius map shows in a column: a button that opens the map on a page of its own. */
import { Button, chakra, Text } from "@chakra-ui/react";
import { LuExternalLink } from "react-icons/lu";
import { widgetPagePath } from "../../../common/widgets.ts";
import { widgetHeading } from "../../surface.ts";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { RadiusMapConfig } from "./config.ts";

export function RadiusMap({ config }: WidgetProps<RadiusMapConfig>) {
  const heading = config.heading.trim();
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <Text fontSize="0.9rem" mb="0.6rem">
        Map the addresses in a spreadsheet that are within driving range of a place.
      </Text>
      <Button
        size="sm"
        variant="outline"
        color="inherit"
        onClick={() => globalThis.open(widgetPagePath("radius-map"), "_blank")}
      >
        <LuExternalLink /> Open Radius Map
      </Button>
    </>
  );
}
