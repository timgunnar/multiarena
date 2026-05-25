import React from "react";
import { Box, Text } from "ink";
import type { DeliberationProgress, RoundRole } from "../../core/deliberation.js";
import { roundLabel } from "../../core/deliberation.js";

const ROLE_COLORS: Record<RoundRole, string> = {
  draft: "cyan",
  revise: "yellow",
  polish: "green",
  review: "magenta",
};

function spinner(frame: number): string {
  const chars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return chars[frame % chars.length] ?? ".";
}

export interface RoundSummary {
  round: number;
  modelName: string;
  role: RoundRole;
  changeCount?: number;
  changeSamples?: string[];
}

interface Props {
  progress: DeliberationProgress;
  document: string;
  thinkText?: string;
  rounds: RoundSummary[];
  scrollOffset?: number;
}

export const DeliberationView: React.FC<Props> = ({ progress, document, thinkText = "", rounds, scrollOffset = 0 }) => {
  const role = progress.role ?? "draft";
  const roleColor = ROLE_COLORS[role];
  const isActive = progress.type !== "done" && progress.type !== "error";
  const isDone = progress.type === "done";
  const isThinking = progress.type === "think_start" || progress.type === "think_text";
  const spin = spinner(Date.now() % 10);

  const allLines = document ? document.split("\n") : [];
  const lines = allLines.slice(scrollOffset);

  // Count total changes across all rounds
  const totalChanges = rounds.reduce((sum, r) => sum + (r.changeCount ?? 0), 0);

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header */}
      <Box flexDirection="row">
        <Text bold>
          {isDone
            ? `审议完成 · ${rounds.length} 轮 · ${totalChanges} 处修改`
            : isActive
              ? `第 ${progress.round}/${progress.totalRounds} 轮：${progress.modelName ?? "?"} (${roundLabel(role)})`
              : "审议出错"}
        </Text>
      </Box>

      {/* Process pipeline */}
      <Box flexDirection="row" marginY={1}>
        {rounds.map((r, i) => {
          const isPast = isDone || r.round < progress.round;
          const isCurrent = !isDone && r.round === progress.round;

          return (
            <Box key={i} marginRight={2} flexDirection="column">
              <Box flexDirection="row">
                <Text color={isPast ? "green" : isCurrent ? roleColor : "gray"}>
                  {isPast ? "✓" : isCurrent ? spin : "○"} {roundLabel(r.role)}
                </Text>
              </Box>
              <Box flexDirection="row">
                <Text dimColor>{r.modelName}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Active round label */}
      {isActive && (
        <Box marginBottom={1}>
          {isThinking ? (
            <Text dimColor>
              💭 思考中 — {progress.modelName} — 分析当前状态…
            </Text>
          ) : (
            <Text color={roleColor}>
              {roundLabel(role)}中 — {progress.modelName} — 正在生成…
            </Text>
          )}
        </Box>
      )}

      {/* Think text (private analysis, shown dimmed) */}
      {thinkText && isThinking && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>── 私有分析 ──</Text>
          {thinkText.split("\n").map((line, i) => (
            <Text key={i} dimColor>{line || " "}</Text>
          ))}
        </Box>
      )}

      {/* Error state */}
      {progress.type === "error" && (
        <Box marginBottom={1}>
          <Text color="red">错误：{progress.error}</Text>
        </Box>
      )}

      {/* Process summary (shown when done) */}
      {isDone && rounds.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>── 审议过程 ──</Text>
          {rounds.map((r) => {
            const hasChanges = (r.changeCount ?? 0) > 0;
            return (
              <Box key={r.round} flexDirection="column" marginTop={1}>
                <Text>
                  <Text color="cyan">{r.round}.</Text>{" "}
                  <Text bold>{r.modelName}</Text>
                  <Text color="gray">（{roundLabel(r.role)}）</Text>
                  {hasChanges && (
                    <Text color="yellow"> — {r.changeCount} 处修改</Text>
                  )}
                  {!hasChanges && r.role !== "draft" && (
                    <Text color="gray"> — 无修改</Text>
                  )}
                </Text>
                {r.changeSamples && r.changeSamples.length > 0 && (
                  <Box flexDirection="column" marginLeft={2}>
                    {r.changeSamples.map((s, j) => (
                      <Text key={j} dimColor>
                        {`  ${s}`}
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
          <Text> </Text>
        </Box>
      )}

      {/* Final document */}
      {isDone && (
        <Box marginBottom={1}>
          <Text bold color="green">── 最终文档 ──</Text>
        </Box>
      )}

      {/* Document content */}
      <Box flexDirection="column" flexGrow={1}>
        {lines.length === 0 && isActive && (
          <Text dimColor>等待输出…</Text>
        )}
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
};
