import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import type { DeliberationProgress } from "../../core/deliberation.js";
import { BroadcastSummary } from "./BroadcastSummary.js";
import { ModelDetail } from "./ModelDetail.js";
import { DeliberationView, type RoundSummary } from "./DeliberationView.js";

interface Props {
  models: ModelState[];
  targetMode: { type: "broadcast" } | { type: "directed"; modelName: string };
  scrollOffsets: Record<string, number>;
  comparisonModel?: string | null;
  terminalWidth: number;
  deliberationProgress?: DeliberationProgress | null;
  deliberationDocument?: string;
  deliberationThinkText?: string;
  deliberationRounds?: RoundSummary[];
  teamMode?: boolean;
  deliberationScrollOffset?: number;
}

export const OutputArea: React.FC<Props> = ({
  models,
  targetMode,
  scrollOffsets,
  comparisonModel,
  terminalWidth,
  deliberationProgress,
  deliberationDocument,
  deliberationThinkText,
  deliberationRounds,
  teamMode,
  deliberationScrollOffset = 0,
}) => {
  // ── Team mode ──────────────────────────────────────────────────
  if (teamMode) {
    // During active deliberation (running): always show deliberation view
    const isDeliberating =
      deliberationProgress &&
      deliberationProgress.type !== "done" &&
      deliberationProgress.type !== "error";

    if (isDeliberating) {
      return (
        <DeliberationView
          progress={deliberationProgress}
          scrollOffset={deliberationScrollOffset}
          document={deliberationDocument ?? ""}
          thinkText={deliberationThinkText ?? ""}
          rounds={deliberationRounds ?? []}
        />
      );
    }

    // Team overview (broadcast target): show deliberation result or idle prompt
    if (targetMode.type === "broadcast") {
      if (deliberationProgress) {
        return (
          <DeliberationView
            progress={deliberationProgress}
            document={deliberationDocument ?? ""}
            thinkText={deliberationThinkText ?? ""}
            rounds={deliberationRounds ?? []}
            scrollOffset={deliberationScrollOffset}
          />
        );
      }
      return (
        <Box flexDirection="column" flexGrow={1} padding={1}>
          <Text bold>团队模式</Text>
          <Text> </Text>
          <Text>输入任务描述即可启动多模型接力审议。</Text>
          <Text dimColor>Tab 可切换到特定模型私聊。Shift+Tab 返回广播模式。</Text>
        </Box>
      );
    }

    // Team directed: Tab drilled into a specific model — show its detail
    const teamModel = models.find((m) => m.name === targetMode.modelName);
    if (teamModel) {
      return (
        <ModelDetail
          model={teamModel}
          scrollOffset={scrollOffsets[teamModel.name] ?? 0}
        />
      );
    }
    return (
      <Box flexGrow={1}>
        <Text>No model selected</Text>
      </Box>
    );
  }

  // ── Not team mode ──────────────────────────────────────────────

  if (targetMode.type === "broadcast") {
    return <BroadcastSummary models={models} terminalWidth={terminalWidth} />;
  }

  const activeModel = models.find((m) => m.name === targetMode.modelName);
  if (!activeModel) {
    return (
      <Box flexGrow={1}>
        <Text>No model selected</Text>
      </Box>
    );
  }

  // ── Comparison mode: two models side by side ──────────────────
  if (comparisonModel) {
    const compModel = models.find((m) => m.name === comparisonModel);
    if (!compModel) {
      return <ModelDetail model={activeModel} scrollOffset={scrollOffsets[activeModel.name] ?? 0} />;
    }
    return (
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} marginRight={1}>
          <ModelDetail model={activeModel} scrollOffset={scrollOffsets[activeModel.name] ?? 0} />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <ModelDetail model={compModel} scrollOffset={scrollOffsets[compModel.name] ?? 0} />
        </Box>
      </Box>
    );
  }

  return <ModelDetail model={activeModel} scrollOffset={scrollOffsets[activeModel.name] ?? 0} />;
};
