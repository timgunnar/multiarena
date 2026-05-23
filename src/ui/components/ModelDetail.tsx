import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";

interface Props {
  model: ModelState;
  scrollOffset: number;
}

export const ModelDetail: React.FC<Props> = ({ model, scrollOffset }) => {
  const allLines = model.buffer.split("\n");
  const visibleLines = allLines.slice(scrollOffset);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visibleLines.length === 0 && !model.isStreaming && (
        <Text dimColor>No output yet</Text>
      )}
      {visibleLines.map((line, i) => (
        <Text key={scrollOffset + i}>{line || " "}</Text>
      ))}
      {model.isStreaming && <Text color="gray">▋</Text>}
    </Box>
  );
};
