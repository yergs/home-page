/** What the student map shows in a column: a button that opens the map over the page. */
import { Button, chakra, Text } from "@chakra-ui/react";
import { LuMaximize2 } from "react-icons/lu";
import { widgetHeading } from "../../surface.ts";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { StudentMapConfig } from "./config.ts";

export function StudentMap({ config, openFullScreen }: WidgetProps<StudentMapConfig>) {
  const heading = config.heading.trim();
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <Text fontSize="0.9rem" mb="0.6rem">
        Map every teacher's students by class day, and see where new families fit into their routes.
      </Text>
      <Button size="sm" variant="outline" color="inherit" onClick={openFullScreen}>
        <LuMaximize2 /> Open Student Map
      </Button>
    </>
  );
}
