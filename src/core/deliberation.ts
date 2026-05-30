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

function buildSystemPrompt(
  role: RoundRole,
  task: string,
  isFinalRound: boolean,
  constraint?: string,
  previousDocument?: string,
  draftAuthor?: string,
): string {
  const constraintBlock = constraint
    ? `\n\n## 约束文档（必须遵守）\n${constraint}`
    : "";

  const header = "你正在参与一个多模型协作起草流程（R2D2：轮转审议起草）。";

  switch (role) {
    case "draft":
      return `${header}你的角色是**起草者**。

## 任务
${task}
${constraintBlock}

## 要求
- 写出一份完整的初稿
- 严格对照约束文档，确保无违规
- 覆盖任务描述中的所有要点
- 后续其他模型会在你的基础上修改，请尽量全面
- 输出完整的文档内容`;

    case "revise": {
      const finalRoundBlock = isFinalRound
        ? `\n## 重要：这是最后一轮
你是最终输出者。请输出一份面向用户的干净终稿：
- 直接在你的修订版正文中完成所有修改，不要使用 [修订:] 标注
- 如果之前文档中有 [修订:] 或 [补充:] 标注，将它们全部清理掉，只保留修改后的干净正文
- 文档读起来应该像一篇自然的成品，没有任何过程标记`
        : "";

      return `${header}你的角色是**修订者**。
${finalRoundBlock}
## 原始任务
${task}
${constraintBlock}

## ${draftAuthor ?? "起草者"} 的初稿
${previousDocument}

## 要求
- 在初稿基础上修订，不要推倒重写
- 对照约束文档，逐条检查违规项并修正
- 补充你发现遗漏的要点
- 改进表达不清或逻辑不严谨的地方
${isFinalRound
  ? "- 输出完整的干净终稿，不要包含任何过程标注"
  : "- 在修改处用 [修订: 原文片段 → 修改后文本] 标注\n- 禁止笼统赞美，只做实质性修改\n- 输出完整的修订版文档"}`;
    }

    case "polish": {
      const finalRoundBlock = isFinalRound
        ? `\n## 重要：这是最后一轮
你是最终输出者。请输出一份面向用户的干净终稿：
- 如果之前文档中有 [修订:] 或 [补充:] 标注，将它们全部清理掉，只保留修改后的干净正文
- 你新增的改进直接写入正文，不要使用 [补充:] 标注
- 文档读起来应该像一篇自然的成品，没有任何过程标记`
        : "";

      return `${header}你的角色是**润色者**。
${finalRoundBlock}
## 原始任务
${task}
${constraintBlock}

## 经过修订的文档
${previousDocument}

## 要求
- 在现有基础上最终润色
- 再次对照约束文档做合规检查
- 优化语言流畅度和可读性
${isFinalRound
  ? "- 输出完整的干净终稿，不要包含任何过程标注"
  : "- 补充你独有的见解（标注 [补充: 你的贡献]）\n- 保留所有之前的修订标注\n- 输出完整的文档"}`;
    }

    case "review":
      return `${header}你的角色是**终审者**（最后一轮）。

## 原始任务
${task}
${constraintBlock}

## 经过多轮修改的文档
${previousDocument}

## 要求
- 审查是否有修改偏离了原意
- 对照约束文档逐条再过一遍
- 清理所有 [修订:] 和 [补充:] 等过程标注，输出干净的最终版
- 如果认可某处修改，直接保留正文；如果需要回退，直接改回并保持正文流畅
- 这是一份面向用户的交付文档，不要包含任何过程标记或审查意见
- 输出最终确认版`;

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
): string {
  const docBlock = previousDocument
    ? `\n\n## 当前文档（请仔细分析）\n${previousDocument}`
    : "";

  const taskBlock = `\n\n## 用户任务/反馈\n${task}`;

  const constraintBlock = constraint
    ? `\n\n## 约束文档\n${constraint}`
    : "";

  switch (role) {
    case "draft":
      return `你即将以**起草者**的身份撰写一份初稿。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}

请简短回答以下问题（用你自己的话，不要长篇大论）：
1. 任务的核心目标是什么？需要覆盖哪些关键要点？
2. 文档应该是什么结构？（章节/段落规划）
3. 有什么需要特别注意的约束或陷阱？
4. 有什么地方信息不足，需要合理假设的？`;

    case "revise":
      return `你即将以**修订者**的身份修改一份文档。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}${docBlock}

请简短回答以下问题：
1. 这份文档的优点是什么？哪些部分写得不错？
2. 存在哪些问题？（偏离任务、遗漏要点、逻辑不严谨、表达不清、潜在的事实错误或幻觉）
3. 对照约束文档，哪些地方违反了约束？
4. 你计划做哪些具体修改？按优先级列出。${isFirstRound ? "\n注意：这是第一轮修订，你看到的是初稿。重点关注初稿是否忠实地回应了用户的任务。" : ""}`;

    case "polish":
      return `你即将以**润色者**的身份最终润色一份文档。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}${docBlock}

请简短回答以下问题：
1. 文档的整体语言质量如何？（流畅度、可读性、语气一致性）
2. 有哪些表达可以更优雅或更精准？
3. 对照约束文档，还有什么需要修正的？
4. 你独有的补充见解是什么？（如果有的话）`;

    case "review":
      return `你即将以**终审者**的身份做最终审查。在此之前，请先进行私有分析：
${taskBlock}${constraintBlock}${docBlock}

请简短回答以下问题：
1. 经过多轮修改后，文档是否偏离了用户的原始意图？
2. 逐条对照约束文档检查——还有违规项吗？
3. 有没有任何模型引入了事实错误或幻觉？
4. 最终交付前，还有什么必须清理或修复的？`;

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
): AsyncGenerator<DeliberationProgress> {
  const documents: string[] = [];
  const totalRounds = roundConfigs.length;

  // Derive the task from the last user message in the shared context.
  const lastUser = [...sharedMessages].reverse().find((m) => m.role === "user");
  const task = lastUser?.content ?? "";

  for (let i = 0; i < roundConfigs.length; i++) {
    const rc = roundConfigs[i];
    const previousDocument = i > 0 ? documents[i - 1] : undefined;
    const draftAuthor = i > 0 ? roundConfigs[0].modelName : undefined;
    const isFinalRound = i === roundConfigs.length - 1;

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
    const thinkPrompt = buildThinkPrompt(
      rc.role,
      task,
      i === 0,
      constraint,
      previousDocument,
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
    ) + thinkBlock;

    // Build messages from the shared context plus this round's role instruction.
    const instruction: Message = {
      role: "user",
      content:
        rc.role === "draft"
          ? `请起草以下文档：\n\n${task}`
          : "请根据你的角色要求和上述文档内容，输出修改后的完整文档。不要输出任何前言或后记，直接输出文档内容。",
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

  // Reverse pass: middle models revise again, first model reviews
  if (active.length >= 2) {
    // Middle models in reverse (skip first and last of forward pass)
    for (let i = fwdCount - 2; i >= 1; i--) {
      result.push({
        modelName: active[i],
        role: "revise",
        config: models[active[i]],
      });
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
