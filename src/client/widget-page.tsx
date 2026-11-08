/** A widget's own full page: just that widget's "page" view, filling the browser tab. */
import { Box, Text } from "@chakra-ui/react";
import { MfeView } from "./mfe/mfe-view.tsx";
import { pageViewName } from "./widget-kit/contract.ts";
import { useWidgetHost } from "./widget-host.tsx";

export function WidgetPage({ id }: { id: string }) {
  const { manager } = useWidgetHost();
  return (
    <Box h="100vh" bg="bg" color="fg">
      <MfeView
        manager={manager}
        mfe={id}
        view={pageViewName}
        props={{}}
        fallback={(message) => <Text p="4" color="fg.error">{message}</Text>}
      />
    </Box>
  );
}
