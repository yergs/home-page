/** The student map widget: a button in the column, and the map in its full-screen view. */
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
import { StudentMapConfig } from "./config.ts";
import { StudentMapPage } from "./page.tsx";
import { StudentMap } from "./student-map.tsx";

function StudentMapEditor({ config, reportDraft }: EditorProps<StudentMapConfig>) {
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

registerMfe("student-map", () => ({
  widget: widgetView(StudentMapConfig, StudentMap),
  editor: editorView(StudentMapConfig, StudentMapEditor),
  "full-screen": fullScreenView(StudentMapConfig, StudentMapPage),
}));
