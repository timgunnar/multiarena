import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";

interface Props {
  models: ModelState[];
  activeModelName: string | null; // null = broadcast
  contextUsages: Record<string, number>; // modelName → 0..1 ratio
}

function renderBar(ratio: number): string {
  const blocks = 10;
  const filled = Math.round(ratio * blocks);
  return "█".repeat(filled) + "░".repeat(blocks - filled);
}

function barColor(ratio: number): string {
  if (ratio > 0.9) return "red";
  if (ratio > 0.7) return "yellow";
  return "green";
}

export const StatusBar: React.FC<Props> = ({ models, activeModelName, contextUsages }) => (
  <Box flexDirection="column">
    {/* Row 1: model names + indicators */}
    <Box height={1} flexDirection="row">
      {models.map((m) => {
        const isActive = activeModelName === m.name;
        const hasNew = m.buffer.length > 0 && !isActive;
        const color = isActive ? "green" : ("white" as const);
        return (
          <Box key={m.name} marginRight={1}>
            <Text color={color} bold={isActive}>
              {m.name}
            </Text>
            {hasNew && <Text color="yellow"> ●</Text>}
            {m.muted && <Text color="gray"> [muted]</Text>}
          </Box>
        );
      })}
    </Box>
    {/* Row 2: context watermarks */}
    <Box height={1} flexDirection="row">
      {models.map((m) => {
        const usage = contextUsages[m.name] ?? 0;
        const pct = Math.round(usage * 100);
        const color = barColor(usage);
        return (
          <Box key={m.name} marginRight={1}>
            <Text color={color}>
              {renderBar(usage)} {pct}%
            </Text>
            {usage > 0.9 && <Text color="red"> ⚠</Text>}
          </Box>
        );
      })}
    </Box>
  </Box>
);
