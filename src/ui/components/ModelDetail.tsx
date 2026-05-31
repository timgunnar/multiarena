import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import { formatTokens } from "./formatTokens.js";

interface Props {
  model: ModelState;
  scrollOffset: number;
}

export const ModelDetail: React.FC<Props> = ({ model, scrollOffset }) => {
  // Build conversation lines: user messages from history, assistant from buffer
  const bufferLines = model.buffer ? model.buffer.split("\n") : [];
  const conversationLines: string[] = [];

  for (const msg of model.messages) {
    if (msg.role === "user") {
      if (conversationLines.length > 0) conversationLines.push("");
      conversationLines.push(`> ${msg.content}`);
    }
  }

  // If buffer has content, it's the current/latest assistant response.
  // If buffer is empty (resumed session), fall back to assistant messages in history.
  const allLines: string[] = [...conversationLines];
  if (bufferLines.length > 0) {
    if (allLines.length > 0) allLines.push("");
    allLines.push(...bufferLines);
  } else {
    // Resumed session: show assistant responses from history
    for (const msg of model.messages) {
      if (msg.role === "assistant" && msg.content) {
        if (allLines.length > 0) allLines.push("");
        allLines.push(...msg.content.split("\n"));
      }
    }
  }

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
