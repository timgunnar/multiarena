import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import { formatTokens } from "./formatTokens.js";

interface Props {
  model: ModelState;
  scrollOffset: number;
}

export const ModelDetail: React.FC<Props> = ({ model, scrollOffset }) => {
  const allLines = model.buffer ? model.buffer.split("\n") : [];
  const visibleLines = allLines.slice(scrollOffset);
  const totalTokens = model.usage.input + model.usage.output;
  const isEmpty = allLines.length === 0 || (allLines.length === 1 && allLines[0].trim() === "");

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray">
      <Text bold>{model.name}</Text>
      {isEmpty && !model.isStreaming && (
        <Text dimColor>No output</Text>
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
      <Text dimColor>
        {formatTokens(totalTokens)}/{formatTokens(model.contextLimit)} · {isEmpty ? 0 : allLines.length} lines · {model.isStreaming ? "streaming..." : "done"}
      </Text>
    </Box>
  );
};
