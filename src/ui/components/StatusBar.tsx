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

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
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
        const isTargeted = activeModelName === null || activeModelName === m.name;
        const color = isTargeted ? "green" : ("white" as const);
        return (
          <Box key={m.name} marginRight={1}>
            <Text color={color} bold={isTargeted}>
              {m.name}
            </Text>
            {isTargeted && !m.muted && <Text color="yellow"> ●</Text>}
            {m.muted && <Text color="gray"> [muted]</Text>}
          </Box>
        );
      })}
    </Box>
    {/* Row 2: context watermarks with token counts */}
    <Box height={1} flexDirection="row">
      {models.map((m) => {
        const usage = contextUsages[m.name] ?? 0;
        const pct = Math.round(usage * 100);
        const color = barColor(usage);
        const used = m.usage.input + m.usage.output;
        return (
          <Box key={m.name} marginRight={1}>
            <Text dimColor>
              {formatTokens(used)}/{formatTokens(m.contextLimit)}{" "}
            </Text>
            <Text color={color}>
              {renderBar(usage)} {pct}%
            </Text>
            {usage > 0.9 && <Text color="red"> ⚠</Text>}
          </Box>
        );
      })}
    </Box>
    {/* Row 3: keyboard hints */}
    <Box height={1} flexDirection="row">
      <Text dimColor>
        Tab:switch  d:compare  m:mute  r:reset  q:quit  ↑↓:scroll/history  Esc:cancel
      </Text>
    </Box>
  </Box>
);
