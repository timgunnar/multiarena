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
      {visibleLines.map((line, i) => {
        const isError = /^\[?(?:Error|error)[:\]]/.test(line);
        return (
          <Text key={scrollOffset + i} color={isError ? "red" : undefined}>
            {line || " "}
          </Text>
        );
      })}
      {model.isStreaming && <Text color="gray">▋</Text>}
    </Box>
  );
};
