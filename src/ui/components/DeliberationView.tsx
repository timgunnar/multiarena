import React from "react";
import { Box, Text } from "ink";
import type { DeliberationProgress, RoundRole } from "../../core/deliberation.js";

const ROLE_COLORS: Record<RoundRole, string> = {
  draft: "cyan",
  revise: "yellow",
  polish: "green",
  review: "magenta",
};

const ROLE_LABELS: Record<RoundRole, string> = {
  draft: "Draft",
  revise: "Revise",
  polish: "Polish",
  review: "Review",
};

function spinner(frame: number): string {
  const chars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return chars[frame % chars.length] ?? ".";
}

interface Props {
  progress: DeliberationProgress;
  document: string;
}

export const DeliberationView: React.FC<Props> = ({ progress, document }) => {
  const role = progress.role ?? "draft";
  const roleLabel = ROLE_LABELS[role];
  const roleColor = ROLE_COLORS[role];
  const isActive = progress.type !== "done";
  const spin = isActive ? spinner(Date.now() % 10) : "✓";

  const lines = document ? document.split("\n") : [];

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header: round progress */}
      <Box flexDirection="row">
        <Text bold>
          R2D2 Deliberation — Round {progress.round}/{progress.totalRounds}
        </Text>
      </Box>

      {/* Round pipeline indicator */}
      <Box flexDirection="row" marginY={1}>
        {(["draft", "revise", "polish", "review"] as RoundRole[]).map((r, i) => {
          const roundIdx = i + 1;
          const isPast = roundIdx < progress.round;
          const isCurrent = roundIdx === progress.round;
          const isFuture = roundIdx > progress.round && roundIdx <= progress.totalRounds;
          const isOutside = roundIdx > progress.totalRounds;

          let color = "gray";
          let prefix = "○";
          if (isPast) { color = "green"; prefix = "●"; }
          else if (isCurrent) { color = ROLE_COLORS[r]; prefix = spin; }
          else if (isFuture) { color = "gray"; prefix = "○"; }

          return (
            <Box key={r} marginRight={1}>
              {!isOutside && (
                <Text color={color}>
                  {prefix} {ROLE_LABELS[r]}
                  {isCurrent && progress.modelName ? ` (${progress.modelName})` : ""}
                  {"  "}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Current round role label */}
      {isActive && (
        <Box marginBottom={1}>
          <Text color={roleColor} bold>
            ── {roleLabel}: {progress.modelName} ──
          </Text>
        </Box>
      )}

      {progress.type === "done" && (
        <Box marginBottom={1}>
          <Text color="green" bold>
            ── Final Document ──
          </Text>
        </Box>
      )}

      {/* Document content */}
      <Box flexDirection="column" flexGrow={1}>
        {lines.length === 0 && isActive && (
          <Text dimColor>Waiting for output...</Text>
        )}
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
};
