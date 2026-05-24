import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import type { DeliberationProgress } from "../../core/deliberation.js";
import { BroadcastSummary } from "./BroadcastSummary.js";
import { ModelDetail } from "./ModelDetail.js";
import { DeliberationView } from "./DeliberationView.js";

interface Props {
  models: ModelState[];
  targetMode: { type: "broadcast" } | { type: "directed"; modelName: string };
  scrollOffsets: Record<string, number>;
  comparisonModel?: string | null;
  terminalWidth: number;
  deliberationProgress?: DeliberationProgress | null;
  deliberationDocument?: string;
}

export const OutputArea: React.FC<Props> = ({
  models,
  targetMode,
  scrollOffsets,
  comparisonModel,
  terminalWidth,
  deliberationProgress,
  deliberationDocument,
}) => {
  // Deliberation mode — show the R2D2 pipeline view
  if (deliberationProgress) {
    return (
      <DeliberationView
        progress={deliberationProgress}
        document={deliberationDocument ?? ""}
      />
    );
  }

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
