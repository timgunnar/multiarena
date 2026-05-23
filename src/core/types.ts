import { Message } from "../provider/types.js";

export type TargetMode =
  | { type: "broadcast" }
  | { type: "directed"; modelName: string };

export interface ModelState {
  name: string;
  provider: string;
  messages: Message[];
  muted: boolean;
  buffer: string;
  isStreaming: boolean;
  usage: { input: number; output: number };
  contextLimit: number;
}

export interface SessionState {
  models: ModelState[];
  targetMode: TargetMode;
  worktreeBase: string;
}
