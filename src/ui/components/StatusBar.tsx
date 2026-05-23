import React from "react";
import { Box, Text } from "ink";
import type { ModelState } from "../../core/types.js";

interface Props {
  models: ModelState[];
  activeModelName: string | null; // null = broadcast
}

export const StatusBar: React.FC<Props> = ({ models, activeModelName }) => (
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
);
