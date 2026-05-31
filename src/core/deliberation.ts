import { runTurn } from "./turn.js";
import type { ModelConfig } from "../config/types.js";
import type { Message } from "../provider/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission.js";

export type RoundRole = "draft" | "revise" | "polish" | "review";

export type AdversarialLevel = "off" | "low" | "medium" | "high";

export type Perspective =
  | "skeptic"
  | "pragmatist"
  | "user_advocate"
  | "devils_advocate"
  | "optimist"
  | "synthesizer";

export const PERSPECTIVE_LABELS: Record<Perspective, string> = {
  skeptic: "质疑者",
  pragmatist: "务实派",
  user_advocate: "用户视角",
  devils_advocate: "反方",
  optimist: "乐观派",
  synthesizer: "综合者",
};

export const PERSPECTIVE_POOL: Perspective[] = [
  "skeptic",
  "pragmatist",
  "user_advocate",
  "devils_advocate",
  "optimist",
  "synthesizer",
];

export interface DeliberationRoundConfig {
  modelName: string;
  role: RoundRole;
  config: ModelConfig;
}

export interface DeliberationProgress {
  type: "think_start" | "think_text" | "think_end" | "round_start" | "text" | "round_end" | "done" | "error";
  round: number;
  totalRounds: number;
  modelName?: string;
  role?: RoundRole;
  content?: string;
  document?: string;
  error?: string;
  /** Number of revision annotations found in this round's output. */
  changeCount?: number;
  /** A few representative revision snippets from this round. */
  changeSamples?: string[];
}

export interface DeliberationResult {
  finalDocument: string;
  rounds: Array<{
    modelName: string;
    role: RoundRole;
    document: string;
  }>;
}

const ROLE_LABELS: Record<RoundRole, string> = {
  draft: "起草",
  revise: "修订",
  polish: "润色",
  review: "终审",
};

/** Human-readable label for a perspective. */
export function perspectiveLabel(p: Perspective): string {
  return PERSPECTIVE_LABELS[p];
}

/** 为参与模型分配批判视角。视角不够时循环复用。 */
export function assignPerspectives(
  modelNames: string[],
  pool?: Perspective[],
): Record<string, Perspective> {
  const perspectives: Record<string, Perspective> = {};
  const src = pool ?? PERSPECTIVE_POOL;

  for (let i = 0; i < modelNames.length; i++) {
    perspectives[modelNames[i]] = src[i % src.length];
  }

  return perspectives;
}

/** 根据对抗强度和角色生成批判指令，追加到 system prompt 末尾。 */
function buildAdversarialPrompt(
  level: AdversarialLevel,
  role: RoundRole,
  perspective?: Perspective,
): string {
  if (level === "off") return "";

  if (level === "low") {
    switch (role) {
      case "revise":
        return "\n\n## 批判要求（低强度）\n你必须对上一轮输出提出至少一个挑战——质疑其假设、指出遗漏的边界情况、暴露逻辑弱点。然后基于这些发现进行修订。";
      case "review":
        return "\n\n## 批判要求（低强度）\n检查前面所有轮次的修改是否引入了新问题。如发现则标注并修正。";
      default:
        return "";
    }
  }

  if (level === "medium") {
    switch (role) {
      case "draft":
        return "\n\n## 起草要求（中强度）\n你起草的文档将在下一轮被其他模型批判性审查。请确保每个论点都有充分的论据支撑。";
      case "revise":
      case "polish":
        return "\n\n## 批判-回应要求（中强度）\n你必须分两部分输出：\n1. **批判点**：明确指出上一轮文档的问题——逻辑漏洞、遗漏、事实错误、或可改进之处。至少列出 2 个具体的批判点。\n2. **修订后文档**：基于你的批判进行修改。对于选择保留原方案的部分，解释为何不改。\n\n格式：\n## 批判点\n1. [具体批判]\n2. [具体批判]\n\n## 修订后文档\n[完整文档]";
      case "review":
        return "\n\n## 终审要求（中强度）\n汇总前面所有轮次中未解决的批判点，逐条写入文档末尾的 '## Open Issues' 段落。如所有批判点已解决则写 '无遗留问题'。";
      default:
        return "";
    }
  }

  if (level === "high" && perspective) {
    const label = PERSPECTIVE_LABELS[perspective];
    let prompt = `\n\n## 批判角色：${label}\n`;

    switch (perspective) {
      case "skeptic":
        prompt += "你是「质疑者」。你质疑一切假设，寻找逻辑漏洞和隐藏风险。每次发言前必须先列出 3 个具体问题或隐患。你的目标是防止团队陷入群体思维。";
        break;
      case "pragmatist":
        prompt += "你是「务实派」。你关注可行性、实现成本、工程边界条件。每个建议必须回答：能落地吗？代价是什么？有什么替代方案？";
        break;
      case "user_advocate":
        prompt += "你是「用户视角」。你站在最终用户/读者立场，关注可读性、实用体验。每轮问自己：用户看得懂吗？真的有用吗？信息组织合理吗？";
        break;
      case "devils_advocate":
        prompt += "你是「反方」。即使内心同意结论，也要刻意从对立面发起挑战。质疑前提、方法、结论。目标是帮团队发现盲区。";
        break;
      case "optimist":
        prompt += "你是「乐观派」。你积极肯定方案的优势和潜力，防止批判过火导致有效方案被削弱。看到好的想法要明确指出并扩展。同时也要承认合理担忧。";
        break;
      case "synthesizer":
        prompt += "你是「综合者」。你在各方争论中找到共识和折中方案。汇总各方合理关切，明确哪些已解决、哪些仍有分歧，提议下一步行动。";
        break;
    }

    prompt += "\n\n你必须先以你的视角对上一轮内容进行评价，然后基于你的评价修改文档。";
    return prompt;
  }

  return "";
}

function buildSystemPrompt(
  role: RoundRole,
  task: string,
  isFinalRound: boolean,
  constraint?: string,
  previousDocument?: string,
  draftAuthor?: string,
  adversarialLevel?: AdversarialLevel,
  perspective?: Perspective,
): string {
  const constraintBlock = constraint
    ? `\n\n## 约束文档（必须遵守）\n${constraint}`
    : "";

  const header = "你正在参与一个多模型协作起草流程（R2D2：轮转审议起草）。";

  switch (role) {
    case "draft": {
      const base = `${header}你的角色是**起草者**。

## 任务
${task}
${constraintBlock}

## 要求
- 写出一份完整的初稿
- 严格对照约束文档，确保无违规
- 覆盖任务描述中的所有要点
- 后续其他模型会在你的基础上修改，请尽量全面
- 输出完整的文档内容`;
      const adv = buildAdversarialPrompt(adversarialLevel ?? "off", role, perspective);
      return base + adv;
    }

    case "revise": {
      const finalRoundBlock = isFinalRound
        ? `\n## 重要：这是最后一轮
你是最终输出者。请输出一份面向用户的干净终稿：
- 直接在你的修订版正文中完成所有修改，不要使用 [修订:] 标注
- 如果之前文档中有 [修订:] 或 [补充:] 标注，将它们全部清理掉，只保留修改后的干净正文
- 文档读起来应该像一篇自然的成品，没有任何过程标记`
        : "";

      const base = `${header}你的角色是**修订者**。
${finalRoundBlock}
## 原始任务
${task}
${constraintBlock}

## 文档版本历史
${previousDocument}

## 要求
- 你可以在任意历史版本的基础上修订——如果后面的改动不如之前的版本，直接回到早期版本继续
- 对照约束文档，逐条检查违规项并修正
- 补充你发现遗漏的要点（用 [修订: 原文 → 补充后文本] 标注新增内容的位置）
- 改进表达不清或逻辑不严谨的地方，可以重写、重组，但保留原有的事实信息和核心观点
${isFinalRound
  ? "- 输出完整的干净终稿，不要包含任何过程标注"
  : "- 在修改处用 [修订: 原文片段 → 修改后文本] 标注\n- 禁止笼统赞美，只做实质性修改\n- 输出完整的修订版文档"}`;
      const adv = buildAdversarialPrompt(adversarialLevel ?? "off", role, perspective);
      return base + adv;
    }

    case "polish": {
      const finalRoundBlock = isFinalRound
        ? `\n## 重要：这是最后一轮
你是最终输出者。请输出一份面向用户的干净终稿：
- 如果之前文档中有 [修订:] 或 [补充:] 标注，将它们全部清理掉，只保留修改后的干净正文
- 你新增的改进直接写入正文，不要使用 [补充:] 标注
- 文档读起来应该像一篇自然的成品，没有任何过程标记`
        : "";

      const base = `${header}你的角色是**润色者**。
${finalRoundBlock}
## 原始任务
${task}
${constraintBlock}

## 文档版本历史
${previousDocument}

## 要求
- **核心原则：保留原文，只做增量润色。** 不要删除已有的正确内容。你的任务是让已有文字更好，而非替换它们。
- 你可以在任意历史版本的基础上润色——如果后面版本质量不如早期版本，回到早期版本继续
- 再次对照约束文档做合规检查
- 优化语言流畅度和可读性，但保持原文结构和内容完整
${isFinalRound
  ? "- 输出完整的干净终稿，不要包含任何过程标注"
  : "- 补充你独有的见解（标注 [补充: 你的贡献]）\n- 保留所有之前的修订标注\n- 输出完整的文档"}`;
      const adv = buildAdversarialPrompt(adversarialLevel ?? "off", role, perspective);
      return base + adv;
    }

    case "review": {
      const base = `${header}你的角色是**终审者**（最后一轮）。

## 原始任务
${task}
${constraintBlock}

## 文档版本历史
${previousDocument}

## 要求
- **核心原则：保护已有内容。** 你的任务是审查和清理，不是改写。保留所有正确的正文，只处理标注和回退错误修改。
- 你可以选择任意历史版本作为终稿基础——不要被最新版本绑定
- 审查是否有修改偏离了原意——如果发现后期修订删除了原本好的内容，从早期版本恢复
- 对照约束文档逐条再过一遍
- 清理所有 [修订:] 和 [补充:] 等过程标注，输出干净的最终版
- 如果认可某处修改，直接保留正文；如果需要回退，直接改回并保持正文流畅
- 这是一份面向用户的交付文档，不要包含任何过程标记或审查意见
- 输出最终确认版`;
      const adv = buildAdversarialPrompt(adversarialLevel ?? "off", role, perspective);
      return base + adv;
    }

    default:
      return "";
  }
}

/**
 * Build a private "think" prompt for the given role.
 * The model analyses the current state before acting — this output is NOT
 * shared with other models, but is fed back into the same model's main
 * round system prompt so its public output is informed by private reasoning.
 */
function buildThinkPrompt(
  role: RoundRole,
  task: string,
  isFirstRound: boolean,
  constraint?: string,
  previousDocument?: string,
  adversarialLevel?: AdversarialLevel,
  perspective?: Perspective,
): string {
  const docBlock = previousDocument
    ? `\n\n## 当前文档（请仔细分析）\n${previousDocument}`
    : "";

  const taskBlock = `\n\n## 用户任务/反馈\n${task}`;

  const constraintBlock = constraint
    ? `\n\n## 约束文档\n${constraint}`
    : "";

  switch (role) {
    case "draft": {
      let hint = "";
      if (adversarialLevel === "high" && perspective) {
        const label = PERSPECTIVE_LABELS[perspective];
        hint = `\n\n你需要以「${label}」的视角来起草这份文档。`;
      } else if (adversarialLevel === "medium") {
        hint = "\n\n注意：你的起草将在下一轮被批判性审查。请确保论点充分、结构坚实。";
      }
      return `你即将以**起草者**的身份撰写一份初稿。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}

请进行私有分析（用流畅的段落文字，禁止编号列表格式）。思考：这个任务的核心目标和关键要点，文档的合理结构，需要注意的约束，以及信息不足时需要合理假设的地方。${hint}`;
    }

    case "revise": {
      let hint = "";
      if (adversarialLevel === "high" && perspective) {
        const label = PERSPECTIVE_LABELS[perspective];
        hint = `\n\n你需要以「${label}」的视角对上一轮文档进行批判和修订。先列出批判要点，再动手修改。`;
      } else if (adversarialLevel === "medium") {
        hint = "\n\n批判-回应模式：先列出对上一轮文档的 2 个以上批判点，再进行修订。";
      } else if (adversarialLevel === "low") {
        hint = "\n\n批判模式：你必须挑战上一轮的假设和逻辑。寻找弱点并将其纳入你的修订计划。";
      }
      return `你即将以**修订者**的身份修改一份文档。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}${docBlock}

请用简短的自然语言进行私有分析，不要使用编号列表。思考：这份文档的优点和存在的问题（偏离任务、遗漏要点、逻辑漏洞、事实错误），约束合规情况，以及你计划做的具体修改。${isFirstRound ? "\n注意：这是第一轮修订，你看到的是初稿。重点关注初稿是否忠实回应了用户的任务。" : ""}${hint}`;
    }

    case "polish": {
      let hint = "";
      if (adversarialLevel === "high" && perspective) {
        const label = PERSPECTIVE_LABELS[perspective];
        hint = `\n\n以「${label}」的视角审视文档，寻找可从该视角改进的地方。`;
      } else if (adversarialLevel === "medium") {
        hint = "\n\n批判-回应模式：先指出上一轮修订中未能解决的问题，再进行润色。";
      }
      return `你即将以**润色者**的身份最终润色一份文档。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}${docBlock}

请用简短的自然语言进行私有分析，不要使用编号列表。思考：文档的语言质量（流畅度、可读性、语气一致性），可以更优雅或精准的表达，约束合规检查，以及你独有的补充见解。${hint}`;
    }

    case "review": {
      let hint = "";
      if (adversarialLevel !== "off" && adversarialLevel) {
        hint = "\n\n对抗模式终审：汇总各轮批判点的解决情况，列出仍在讨论中的分歧供用户参考。";
      }
      return `你即将以**终审者**的身份做最终审查。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}${docBlock}

请用简短的自然语言进行私有分析，不要使用编号列表。思考：经过多轮修改后文档是否偏离了用户的原始意图，逐条对照约束检查是否还有违规项，是否有模型引入事实错误或幻觉，最终交付前还有什么必须清理修复的。${hint}`;
    }

    default:
      return "";
  }
}

/**
 * Run the R2D2 (Round-Robin Deliberative Drafting) pipeline.
 *
 * Models take turns in sequence: the first drafts, the second revises,
 * the third polishes, and optionally a fourth reviews. Each round's
 * system prompt injects the task, constraint document, and previous
 * round output for context. No central synthesizer — the document
 * emerges through sequential refinement.
 */
export async function* runDeliberation(
  sharedMessages: Message[],
  roundConfigs: DeliberationRoundConfig[],
  constraint?: string,
  worktreePath?: string,
  adversarialLevel?: AdversarialLevel,
  perspectives?: Record<string, Perspective>,
): AsyncGenerator<DeliberationProgress> {
  const documents: string[] = [];
  const totalRounds = roundConfigs.length;

  // Derive the task from the last user message in the shared context.
  const lastUser = [...sharedMessages].reverse().find((m) => m.role === "user");
  const task = lastUser?.content ?? "";

  // Detect follow-up editing: are there assistant messages BEFORE the last user message?
  // This means a prior deliberation produced output, and user is now editing.
  let priorAsstCount = 0;
  let foundLastUser = false;
  for (let j = sharedMessages.length - 1; j >= 0; j--) {
    if (sharedMessages[j].role === "user" && !foundLastUser) {
      foundLastUser = true;
      continue;
    }
    if (foundLastUser && sharedMessages[j].role === "assistant") {
      priorAsstCount++;
    }
  }
  const isFollowUpEdit = priorAsstCount > 0;
  // Determine if the user wants a rewrite (重写) vs revision (改写)
  const isRewrite = /重[写新]|重新起草|推倒|从头|重新来|重来/.test(task);
  const isReviseOnly = /加[入上]|增加|补充|修改|改[写一]|调整|润色|优化|删[除掉]/.test(task) || !isRewrite;

  for (let i = 0; i < roundConfigs.length; i++) {
    const rc = roundConfigs[i];
    const draftAuthor = i > 0 ? roundConfigs[0].modelName : undefined;
    const isFinalRound = i === roundConfigs.length - 1;

    // Build version history so models can reference or revert to any earlier draft
    const previousDocument = i > 0
      ? documents.map((doc, idx) =>
          `## 第 ${idx + 1} 轮 (${roundConfigs[idx].modelName} · ${roundLabel(roundConfigs[idx].role)})\n\n${doc}`
        ).join("\n\n---\n\n")
      : undefined;

    yield {
      type: "round_start",
      round: i + 1,
      totalRounds,
      modelName: rc.modelName,
      role: rc.role,
    };

    // ── Private Think Phase ──────────────────────────────────────
    // The model analyses the current state privately before acting.
    // This output is NOT shared with other models — it only informs
    // this model's own main round via the system prompt.
    let thinkOutput = "";
    const perspective = adversarialLevel === "high"
      ? perspectives?.[rc.modelName]
      : undefined;
    const thinkPrompt = buildThinkPrompt(
      rc.role,
      task,
      i === 0,
      constraint,
      previousDocument,
      adversarialLevel,
      perspective,
    );

    if (thinkPrompt) {
      yield {
        type: "think_start",
        round: i + 1,
        totalRounds,
        modelName: rc.modelName,
        role: rc.role,
      };

      try {
        const thinkStream = runTurn({
          modelName: rc.modelName,
          config: rc.config,
          messages: [{ role: "user", content: "请按上述要求进行分析。用简洁的语言回答，不要长篇大论。" }],
          systemPrompt: thinkPrompt,
          tools: [],
          registry: new ToolRegistry(),
          permission: new PermissionManager(),
          worktreePath: worktreePath ?? process.cwd(),
        });

        for await (const event of thinkStream) {
          if (event.type === "text") {
            thinkOutput += event.content;
            yield {
              type: "think_text",
              round: i + 1,
              totalRounds,
              modelName: rc.modelName,
              role: rc.role,
              content: event.content,
            };
          } else if (event.type === "error") {
            // Think failure is non-fatal — proceed without think context
            thinkOutput = "";
            break;
          }
        }
      } catch {
        thinkOutput = "";
      }

      yield {
        type: "think_end",
        round: i + 1,
        totalRounds,
        modelName: rc.modelName,
        role: rc.role,
      };
    }

    // ── Main Round System Prompt (informed by private think) ──────
    const thinkBlock = thinkOutput
      ? `\n\n## 你的私有分析结果\n以下是你刚才对当前状态的分析。请基于这些洞察来完成你的任务：\n\n${thinkOutput}`
      : "";

    const systemPrompt = buildSystemPrompt(
      rc.role,
      task,
      isFinalRound,
      constraint,
      previousDocument,
      draftAuthor,
      adversarialLevel,
      perspective,
    ) + thinkBlock;

    // Build messages from the shared context plus this round's role instruction.
    let instructionText: string;
    if (rc.role === "draft") {
      if (isFollowUpEdit) {
        // Follow-up edit to an existing deliberation document
        instructionText = isRewrite
          ? `用户要求对已有文档进行**重写**：\n\n${task}\n\n请重新起草相关部分，可以完全替换原文。`
          : `用户要求对已有文档进行**修改**：\n\n${task}\n\n请在现有文档的基础上做定向修改，保留文档整体的结构和正确内容，只针对用户要求的部分进行调整。`;
      } else {
        instructionText = `请起草以下文档：\n\n${task}`;
      }
    } else {
      instructionText = "请根据你的角色要求和上述文档内容，输出修改后的完整文档。不要输出任何前言或后记，直接输出文档内容。";
    }
    const instruction: Message = {
      role: "user",
      content: instructionText,
    };
    const messages: Message[] = [...sharedMessages, instruction];

    let buffer = "";

    try {
      const stream = runTurn({
        modelName: rc.modelName,
        config: rc.config,
        messages,
        systemPrompt,
        tools: [],
        registry: new ToolRegistry(),
        permission: new PermissionManager(),
        worktreePath: worktreePath ?? process.cwd(),
      });

      for await (const event of stream) {
        if (event.type === "text") {
          buffer += event.content;
          yield {
            type: "text",
            round: i + 1,
            totalRounds,
            modelName: rc.modelName,
            role: rc.role,
            content: event.content,
          };
        } else if (event.type === "error") {
          buffer += `\n[错误: ${event.message}]`;
          yield {
            type: "text",
            round: i + 1,
            totalRounds,
            modelName: rc.modelName,
            role: rc.role,
            content: `\n[错误: ${event.message}]`,
          };
          break;
        }
      }
    } catch (err: any) {
      yield {
        type: "error",
        round: i + 1,
        totalRounds,
        modelName: rc.modelName,
        role: rc.role,
        error: err.message,
      };
      return;
    }

    documents.push(buffer);
    sharedMessages.push({ role: "assistant", content: buffer });

    // Extract revision annotations for the process summary
    const revisionMatches = buffer.match(/\[修订:\s*([^\]]+?)\]/g) ?? [];
    const changeSamples = revisionMatches
      .map((m) => m.replace(/^\[修订:\s*/, "").replace(/\]$/, ""))
      .slice(0, 5);

    yield {
      type: "round_end",
      round: i + 1,
      totalRounds,
      modelName: rc.modelName,
      role: rc.role,
      document: buffer,
      changeCount: revisionMatches.length,
      changeSamples: changeSamples.length > 0 ? changeSamples : undefined,
    };

    // Yield to the event loop so React renders the round's output
    // before the next round_start event arrives, preventing batch
    // collapse between round_end and round_start.
    if (i < roundConfigs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  yield {
    type: "done",
    round: totalRounds,
    totalRounds,
    document: documents[documents.length - 1],
  };
}

/** Build round configs with mirror pattern: A→B→C→B→A. */
export function autoAssignRounds(
  modelNames: string[],
  models: Record<string, ModelConfig>,
  adversarialLevel?: AdversarialLevel,
  perspectives?: Record<string, Perspective>,
): DeliberationRoundConfig[] {
  const active = modelNames.filter((n) => models[n]);
  if (active.length < 2) return [];

  const forwardRoles: RoundRole[] = ["draft", "revise", "polish"];
  if (active.length >= 4) forwardRoles.push("review");

  // Forward pass: assign roles to first N models
  const result: DeliberationRoundConfig[] = [];
  const fwdCount = Math.min(active.length, forwardRoles.length);
  for (let i = 0; i < fwdCount; i++) {
    result.push({
      modelName: active[i],
      role: forwardRoles[i],
      config: models[active[i]],
    });
  }

  // Reverse pass: all non-first models revise again, first model reviews.
  // For adversarial=high, include the last forward model and double each reverse.
  // For off/low/medium, skip the last forward model (it just polished/reviewed).
  if (active.length >= 2) {
    const reverseStart = adversarialLevel === "high" ? fwdCount - 1 : fwdCount - 2;
    for (let i = reverseStart; i >= 1; i--) {
      result.push({
        modelName: active[i],
        role: "revise",
        config: models[active[i]],
      });
      // HIGH: 追加反批判轮次 — 同一模型检视刚被批判内容后的再次修订
      if (adversarialLevel === "high") {
        result.push({
          modelName: active[i],
          role: "polish",
          config: models[active[i]],
        });
      }
    }
    // First model does final review
    result.push({
      modelName: active[0],
      role: "review",
      config: models[active[0]],
    });
  }

  return result;
}

/** Human-readable label for a round role. */
export function roundLabel(role: RoundRole): string {
  return ROLE_LABELS[role];
}

export interface MergeInput {
  modelName: string;
  content: string;
}

/**
 * Synthesize existing model outputs into one final document.
 * Single-turn: one model acts as the merger, combining all outputs
 * into a coherent document with source annotations and conflict notes.
 */
export async function* runMerge(
  task: string,
  outputs: MergeInput[],
  mergerConfig: ModelConfig,
  mergerName: string,
): AsyncGenerator<DeliberationProgress> {
  const outputBlock = outputs
    .map((o) => `### ${o.modelName}\n\n${o.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `你正在执行多模型输出的合并合成任务。

## 原始任务
${task}

## 各模型的输出
${outputBlock}

## 合并要求

1. **识别共识** — 找出所有模型中一致或高度相似的论点、事实、建议，合并后作为 [共识] 部分
2. **保留独有贡献** — 每个模型独有的观点、细节、角度，标注 [来源: 模型名]
3. **标注分歧** — 如果模型之间对某个问题有不同意见，客观列出各方观点，标注 [分歧]
4. **去重合并** — 相似内容合并而不是重复
5. **保持完整** — 不要遗漏任何模型的任何实质内容
6. **语言流畅** — 最终输出应读起来像一篇连贯的文档，而不是拼凑

## 输出格式
直接输出合并后的完整文档。每个段落/章节末尾用 [] 标注来源。
禁止输出前言或后记。`;

  yield {
    type: "round_start",
    round: 1,
    totalRounds: 1,
    modelName: mergerName,
    role: "draft",
  };

  const messages: Message[] = [
    { role: "user", content: "请根据各模型的输出，合并生成一份最终文档。" },
  ];

  let buffer = "";

  try {
    const stream = runTurn({
      modelName: mergerName,
      config: mergerConfig,
      messages,
      systemPrompt,
      tools: [],
      registry: new ToolRegistry(),
      permission: new PermissionManager(),
      worktreePath: process.cwd(),
    });

    for await (const event of stream) {
      if (event.type === "text") {
        buffer += event.content;
        yield {
          type: "text",
          round: 1,
          totalRounds: 1,
          modelName: mergerName,
          role: "draft",
          content: event.content,
        };
      } else if (event.type === "error") {
        buffer += `\n[错误: ${event.message}]`;
        yield {
          type: "text",
          round: 1,
          totalRounds: 1,
          modelName: mergerName,
          role: "draft",
          content: `\n[错误: ${event.message}]`,
        };
        break;
      }
    }
  } catch (err: any) {
    yield {
      type: "error",
      round: 1,
      totalRounds: 1,
      modelName: mergerName,
      error: err.message,
    };
    return;
  }

  yield {
    type: "round_end",
    round: 1,
    totalRounds: 1,
    modelName: mergerName,
    role: "draft",
    document: buffer,
  };

  // Yield to the event loop so the UI renders before "done"
  await new Promise((resolve) => setTimeout(resolve, 0));

  yield {
    type: "done",
    round: 1,
    totalRounds: 1,
    document: buffer,
  };
}
