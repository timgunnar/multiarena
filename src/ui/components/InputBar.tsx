import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { ModelState } from "../../core/types.js";

interface Props {
  models: ModelState[];
  activeModelName: string | null; // null = broadcast
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export const InputBar: React.FC<Props> = ({
  models,
  activeModelName,
  prefix,
  value,
  onChange,
  onSubmit,
}) => (
  <Box flexDirection="column">
    {/* Row 1: model indicators */}
    <Box height={1} flexDirection="row">
      {models.map((m) => {
        const isTargeted = activeModelName === null || activeModelName === m.name;
        return (
          <Box key={m.name} marginRight={1}>
            <Text color={isTargeted && !m.muted ? "green" : "gray"} bold={isTargeted}>
              {m.name}
            </Text>
            {isTargeted && !m.muted && <Text color="yellow"> ●</Text>}
            {m.muted && <Text color="gray"> [muted]</Text>}
          </Box>
        );
      })}
      <Text dimColor> — Shift+Tab:broadcast/team Tab:model d:compare m:mute r:reset q:quit ↑↓:scroll/history Esc:cancel</Text>
    </Box>
    {/* Row 2: input */}
    <Box height={1} flexDirection="row">
      <Box marginRight={1}>
        <Text color="green">[{prefix}]</Text>
      </Box>
      <Text>{"> "}</Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
    </Box>
  </Box>
);
