import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import { BroadcastSummary } from "./BroadcastSummary.js";
import { ModelDetail } from "./ModelDetail.js";

interface Props {
  models: ModelState[];
  targetMode: { type: "broadcast" } | { type: "directed"; modelName: string };
  scrollOffset: number;
  /** When set, render this model side-by-side with the active model. */
  comparisonModel?: string | null;
}

export const OutputArea: React.FC<Props> = ({
  models,
  targetMode,
  scrollOffset,
  comparisonModel,
}) => {
  if (targetMode.type === "broadcast") {
    // Comparison mode is not applied in broadcast — show the regular summary.
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
      return <ModelDetail model={activeModel} scrollOffset={scrollOffset} />;
    }
    return (
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} marginRight={1}>
          <Text bold>{activeModel.name}</Text>
          <ModelDetail model={activeModel} scrollOffset={scrollOffset} />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text bold>{compModel.name}</Text>
          <ModelDetail model={compModel} scrollOffset={scrollOffset} />
        </Box>
      </Box>
    );
  }

  return <ModelDetail model={activeModel} scrollOffset={scrollOffset} />;
};
