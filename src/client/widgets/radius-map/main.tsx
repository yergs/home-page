/** The radius map widget: a button in the column, and the map in its full-screen view. */
import { Box, Input, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { registerMfe } from "../../mfe/register-live.tsx";
import { Label } from "../../widget-kit/form.tsx";
import {
  type EditorProps,
  editorView,
  fullScreenView,
  widgetView,
} from "../../widget-kit/views.tsx";
import { RadiusMapConfig } from "./config.ts";
import { RadiusMapPage } from "./page.tsx";
import { RadiusMap } from "./radius-map.tsx";

function RadiusMapEditor({ config, reportDraft }: EditorProps<RadiusMapConfig>) {
  const [draft, setDraft] = useState(config);
  useEffect(() => reportDraft({ ok: true, config }), []);
  return (
    <Box>
      <Label>Heading</Label>
      <Input
        size="sm"
        value={draft.heading}
        placeholder="None"
        onChange={(e) => {
          const next = { ...draft, heading: e.target.value };
          setDraft(next);
          reportDraft({ ok: true, config: next });
        }}
      />
      <Text fontSize="sm" color="fg.muted" mt="2">
        The map opens over the page from the button in the column.
      </Text>
    </Box>
  );
}

registerMfe("radius-map", () => ({
  widget: widgetView(RadiusMapConfig, RadiusMap),
  editor: editorView(RadiusMapConfig, RadiusMapEditor),
  "full-screen": fullScreenView(RadiusMapConfig, RadiusMapPage),
}));
