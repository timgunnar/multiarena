import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";

interface Props {
  models: ModelState[];
}

const PANEL_LINES = 4;

export const BroadcastSummary: React.FC<Props> = ({ models }) => {
  const activeModels = models.filter((m) => !m.muted);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {activeModels.map((m) => {
        const lines = m.buffer.split("\n").slice(0, PANEL_LINES);
        const totalLines = m.buffer.split("\n").length;
        return (
          <Box
            key={m.name}
            flexDirection="column"
            flexGrow={1}
            borderStyle="single"
            borderColor="gray"
            marginRight={1}
          >
            <Text bold>{m.name}</Text>
            {lines.map((line, i) => (
              <Text key={i} wrap="truncate">
                {line || " "}
              </Text>
            ))}
            {totalLines === 0 && (
              <Text dimColor>Waiting...</Text>
            )}
            <Text dimColor>
              {totalLines} lines · {m.isStreaming ? "streaming..." : "done"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
