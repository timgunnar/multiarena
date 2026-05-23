import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface Props {
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export const InputBar: React.FC<Props> = ({ prefix, value, onChange, onSubmit }) => (
  <Box height={1} flexDirection="row">
    <Box marginRight={1}>
      <Text color="green">[{prefix}]</Text>
    </Box>
    <Text>{"> "}</Text>
    <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
  </Box>
);
