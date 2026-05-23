import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import { BroadcastSummary } from "./BroadcastSummary.js";
import { ModelDetail } from "./ModelDetail.js";

interface Props {
  models: ModelState[];
  targetMode: { type: "broadcast" } | { type: "directed"; modelName: string };
  scrollOffsets: Record<string, number>;
  comparisonModel?: string | null;
}

export const OutputArea: React.FC<Props> = ({
  models,
  targetMode,
  scrollOffsets,
  comparisonModel,
}) => {
  if (targetMode.type === "broadcast") {
    return <BroadcastSummary models={models} />;
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
          <Text bold>{activeModel.name}</Text>
          <ModelDetail model={activeModel} scrollOffset={scrollOffsets[activeModel.name] ?? 0} />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text bold>{compModel.name}</Text>
          <ModelDetail model={compModel} scrollOffset={scrollOffsets[compModel.name] ?? 0} />
        </Box>
      </Box>
    );
  }

  return <ModelDetail model={activeModel} scrollOffset={scrollOffsets[activeModel.name] ?? 0} />;
};
