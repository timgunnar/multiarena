import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { ModelState } from "../../core/types.js";
import { friendlyToolLabel } from "../../core/turn.js";

interface Props {
  models: ModelState[];
  activeModelName: string | null; // null = broadcast
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  permissionPrompt: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    modelName: string;
  } | null;
}

export const InputBar: React.FC<Props> = ({
  models,
  activeModelName,
  prefix,
  value,
  onChange,
  onSubmit,
  permissionPrompt,
}) => {
  const promptLabel = permissionPrompt
    ? friendlyToolLabel(permissionPrompt.toolName, permissionPrompt.args).trim()
    : "";

  return (
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
        <Text dimColor>
          {permissionPrompt
            ? " --- Respond: y/n/a/d (quit: q)"
            : " --- Shift+Tab:/team Tab:model d:compare m:mute r:reset q:quit ↑↓:scroll/history Esc:cancel"}
        </Text>
      </Box>

      {/* Row 2: Permission prompt (conditional) */}
      {permissionPrompt && (
        <Box height={1} flexDirection="row">
          <Text color="yellow" bold>
            !!! Allow "{permissionPrompt.modelName}" to run {promptLabel}?
          </Text>
          <Text color="cyan"> [y]es</Text>
          <Text color="gray">/[n]o</Text>
          <Text color="green">/[a]lways allow</Text>
          <Text color="red">/[d]eny always</Text>
        </Box>
      )}

      {/* Row 3: input */}
      <Box height={1} flexDirection="row">
        <Box marginRight={1}>
          <Text color="green">[{prefix}]</Text>
        </Box>
        <Text>{"> "}</Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      </Box>
    </Box>
  );
};
