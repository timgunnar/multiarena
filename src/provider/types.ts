export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface TokenUsage {
  input: number;
  output: number;
}

export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; args: string }
  | { type: "done"; usage: TokenUsage }
  | { type: "error"; message: string };

export interface ChatRequest {
  messages: Message[];
  tools?: ToolDef[];
  system?: string;
  model?: string;
}
