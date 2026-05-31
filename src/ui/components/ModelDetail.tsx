import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import { formatTokens } from "./formatTokens.js";

interface Props {
  model: ModelState;
  scrollOffset: number;
}

export const ModelDetail: React.FC<Props> = ({ model, scrollOffset }) => {
  // Build conversation lines from message history + current streaming buffer
  const conversationLines: string[] = [];
  for (const msg of model.messages) {
    if (msg.role === "user") {
      conversationLines.push("");
      conversationLines.push(`> ${msg.content}`);
    } else if (msg.role === "assistant") {
      // assistant content already shown via buffer; skip if buffer matches
      // Otherwise show it (for resumed sessions where buffer may be empty)
      if (msg.content) {
        conversationLines.push("");
        for (const line of msg.content.split("\n")) {
          conversationLines.push(line);
        }
      }
    }
    // tool results are informational — skip
  }

  // If streaming, the buffer has the latest incomplete response not yet in messages
  const hasHistory = conversationLines.length > 0;
  const bufferLines = model.buffer ? model.buffer.split("\n") : [];
  const allLines = hasHistory
    ? [...conversationLines, ...(model.isStreaming ? ["", ...bufferLines] : [])]
    : bufferLines;

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
        const isUserMsg = line.startsWith("> ");
        const isError = /^\[?(?:Error|error)[:\]]/.test(line);
        return (
          <Text
            key={scrollOffset + i}
            color={isError ? "red" : undefined}
            dimColor={isUserMsg}
            bold={isUserMsg}
          >
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
