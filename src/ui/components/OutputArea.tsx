import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";
import { BroadcastSummary } from "./BroadcastSummary.js";
import { ModelDetail } from "./ModelDetail.js";

interface Props {
  models: ModelState[];
  targetMode: { type: "broadcast" } | { type: "directed"; modelName: string };
  scrollOffset: number;
}

export const OutputArea: React.FC<Props> = ({ models, targetMode, scrollOffset }) => {
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

  return <ModelDetail model={activeModel} scrollOffset={scrollOffset} />;
};
