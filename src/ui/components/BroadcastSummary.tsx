import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import { formatTokens } from "./formatTokens.js";

interface Props {
  models: ModelState[];
  terminalWidth: number;
}

const PANEL_LINES = 4;

export const BroadcastSummary: React.FC<Props> = ({ models, terminalWidth }) => {
  const activeModels = models.filter((m) => !m.muted);
  const panelWidth = Math.floor(terminalWidth / activeModels.length);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {activeModels.map((m, idx) => {
        // Build display lines from conversation history
        const rawLines: string[] = [];
        for (const msg of m.messages) {
          if (msg.role === "user") {
            rawLines.push(`> ${msg.content}`);
          }
        }
        // Add buffer lines (assistant output)
        if (m.buffer) {
          rawLines.push(...m.buffer.split("\n"));
        }

        const totalLines = rawLines.length;
        const isEmpty = totalLines === 0 || (totalLines === 1 && rawLines[0].trim() === "");
        const displayLines = rawLines.slice(-PANEL_LINES);
        while (displayLines.length < PANEL_LINES) {
          displayLines.unshift("");
        }
        const isLast = idx === activeModels.length - 1;
        return (
          <Box
            key={m.name}
            flexDirection="column"
            width={panelWidth}
            borderStyle="single"
            borderColor="gray"
            marginRight={isLast ? 0 : 1}
          >
            <Text bold>{m.name}</Text>
            {displayLines.map((line, i) => {
              if (isEmpty && i === 0) {
                return (
                  <Text key={i} dimColor>
                    {m.isStreaming ? "Waiting..." : "No output"}
                  </Text>
                );
              }
              const isUserMsg = line.startsWith("> ");
              return (
                <Text key={i} wrap="truncate" dimColor={isUserMsg}>
                  {line || " "}
                </Text>
              );
            })}
            <Text dimColor>
              {isEmpty ? 0 : totalLines} lines · {formatTokens(m.usage.input + m.usage.output)}/{formatTokens(m.contextLimit)} · {m.isStreaming ? "streaming..." : "done"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
