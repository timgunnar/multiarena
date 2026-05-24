import { runTurn } from "./turn.js";
import type { ModelConfig } from "../config/types.js";
import type { Message } from "../provider/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission.js";

export type RoundRole = "draft" | "revise" | "polish" | "review";

export interface DeliberationRoundConfig {
  modelName: string;
  role: RoundRole;
  config: ModelConfig;
}

export interface DeliberationProgress {
  type: "round_start" | "text" | "round_end" | "done" | "error";
  round: number;
  totalRounds: number;
  modelName?: string;
  role?: RoundRole;
  content?: string;
  document?: string;
  error?: string;
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

    case "revise":
      return `${header}你的角色是**修订者**。

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
- 在修改处用 [修订: 原文片段 → 修改后文本] 标注
- 禁止笼统赞美，只做实质性修改
- 输出完整的修订版文档`;

    case "polish":
      return `${header}你的角色是**润色者**。

## 原始任务
${task}
${constraintBlock}

## 经过修订的文档
${previousDocument}

## 要求
- 在现有基础上最终润色
- 再次对照约束文档做合规检查
- 优化语言流畅度和可读性
- 补充你独有的见解（标注 [补充: 你的贡献]）
- 保留所有之前的修订标注
- 输出最终的完整文档`;

    case "review":
      return `${header}你的角色是**终审者**。

## 原始任务
${task}
${constraintBlock}

## 经过多轮修改的最终版
${previousDocument}

## 要求
- 审查是否有修改偏离了原意，如有标注 [终审: 偏离原意 — 说明]
- 对照约束文档逐条再过一遍
- 检查修订标注是否合理
- 确认后输出最终版（可选择接受或回退某处修改，标注 [终审: 回退 — 原因]）
- 输出最终确认版`;

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
  task: string,
  roundConfigs: DeliberationRoundConfig[],
  constraint?: string,
  worktreePath?: string,
): AsyncGenerator<DeliberationProgress> {
  const documents: string[] = [];
  const totalRounds = roundConfigs.length;

  for (let i = 0; i < roundConfigs.length; i++) {
    const rc = roundConfigs[i];
    const previousDocument = i > 0 ? documents[i - 1] : undefined;
    const draftAuthor = i > 0 ? roundConfigs[0].modelName : undefined;

    const systemPrompt = buildSystemPrompt(
      rc.role,
      task,
      constraint,
      previousDocument,
      draftAuthor,
    );

    yield {
      type: "round_start",
      round: i + 1,
      totalRounds,
      modelName: rc.modelName,
      role: rc.role,
    };

    const messages: Message[] = [
      {
        role: "user",
        content:
          rc.role === "draft"
            ? `请起草以下文档：\n\n${task}`
            : "请根据你的角色要求和上述文档内容，输出修改后的完整文档。不要输出任何前言或后记，直接输出文档内容。",
      },
    ];

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

    yield {
      type: "round_end",
      round: i + 1,
      totalRounds,
      modelName: rc.modelName,
      role: rc.role,
      document: buffer,
    };
  }

  yield {
    type: "done",
    round: totalRounds,
    totalRounds,
    document: documents[documents.length - 1],
  };
}

/** Build round configs from model names and configs, auto-assigning roles. */
export function autoAssignRounds(
  modelNames: string[],
  models: Record<string, ModelConfig>,
): DeliberationRoundConfig[] {
  const roles: RoundRole[] = ["draft", "revise", "polish"];
  if (modelNames.length >= 4) {
    roles.push("review");
  }

  return modelNames.slice(0, roles.length).map((name, i) => ({
    modelName: name,
    role: roles[i],
    config: models[name],
  }));
}

/** Human-readable label for a round role. */
export function roundLabel(role: RoundRole): string {
  return ROLE_LABELS[role];
}
