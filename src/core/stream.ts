import { Provider, createProvider } from "../provider/provider.js";
import { StreamEvent, ChatRequest, ToolDef } from "../provider/types.js";
import { Session } from "./session.js";
import { ArenaConfig } from "../config/types.js";

export interface StreamResult {
  modelName: string;
  events: AsyncGenerator<StreamEvent>;
  provider: Provider;
}

/** Launch concurrent streams for the current target model(s) */
export function launchStreams(
  session: Session,
  config: ArenaConfig,
  systemPrompt: string,
  tools: ToolDef[],
): StreamResult[] {
  const targets =
    session.targetMode.type === "broadcast"
      ? session.models.filter((m) => !m.muted)
      : session.models.filter(
          (m) =>
            m.name ===
            (session.targetMode as { type: "directed"; modelName: string }).modelName,
        );

  return targets.map((m) => {
    const mc = config.models[m.name];
    if (!mc) throw new Error(`No config for model "${m.name}"`);

    const provider = createProvider(mc);
    const request: ChatRequest = {
      messages: [...m.messages],
      tools,
      system: systemPrompt,
      model: mc.model,
    };

    return {
      modelName: m.name,
      events: provider.chat(request),
      provider,
    };
  });
}
