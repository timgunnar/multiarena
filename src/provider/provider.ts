import { ChatRequest, StreamEvent } from "./types.js";

export interface Provider {
  chat(request: ChatRequest): AsyncGenerator<StreamEvent>;
  abort(): void;
}
