# MultiArena 上下文管理与系统提示词

> 本文档记录 multiarena 内部如何管理各模型的上下文，以及系统提示词的具体内容和注入策略。
> 最后更新：2026-05-24（v0.1.3 → 共享上下文重构）

## 一、两层上下文架构

multiarena 有两条独立的上下文管理路径：

### 1. 广播模式 — 独立历史

每个模型维护私有的 `messages: Message[]`（`src/core/session.ts` → `ModelState`）。用户消息通过 `Session.addUserMessage()` 分发：

```
用户输入 "写一个排序函数"
  → session.addUserMessage("写一个排序函数")
    → claude.messages.push({role: "user", content: "写一个排序函数"})
    → gpt.messages.push({role: "user", content: "写一个排序函数"})
    → minimax.messages.push({role: "user", content: "写一个排序函数"})
  → 并发调用 runTurn({messages: claude.messages})
              runTurn({messages: gpt.messages})
              runTurn({messages: minimax.messages})
  → 各模型的回复 push 回各自的 messages[]

结果：三个模型有相同的问题，但各自独立的回答。后续 Tab 到某个模型继续对话时，只有该模型看到后续消息。
```

**设计意图**：广播模式下，每个模型是独立的回答者。用户对比回答，选择最佳结果。模型之间不需要互相感知。

### 2. 团队模式 — 共享历史

团队模式使用 `Session.teamMessages: Message[]`（`src/core/session.ts:41`），所有模型共享同一个消息线程：

```
用户输入 "写一篇关于 X 的文档"
  → session.teamMessages.push({role: "user", content: "写一篇关于 X 的文档"})
  
审议轮次 1（起草，minimax）：
  → 系统提示词: "你是起草者..."
  → 消息上下文: teamMessages + 轮次指令
  → minimax 回复 push 到 teamMessages

审议轮次 2（修订，deepseek）：
  → 系统提示词: "你是修订者..."
  → 消息上下文: teamMessages（包含起草产出） + 轮次指令
  → deepseek 回复 push 到 teamMessages

审议完成 → teamMessages 已有完整的对话链，无需额外注入。

用户继续修改 "把语气改文艺一些"：
  → teamMessages.push({role: "user", content: "把语气改文艺一些"})
  → 新一轮审议启动
  → 起草者看到：原始任务 + 前一轮所有产出 + 新指令 ← 上下文自然完整
```

**设计意图**：团队模式是一个聊天室，所有模型看到相同的消息历史。审议是聊天室内的一种特定交互协议。

## 二、上下文注入策略

### 广播模式

`runTurn()` 的调用者（`src/ui/app.tsx:716-725`）传入 `messages: m.messages`——模型的完整历史。此外：

- **系统提示词**：每个模型独立注入，标识模型身份（见下文"通用系统提示词"）
- **工具定义**：所有模型收到相同的工具列表（6 个内置工具）
- **Worktree 隔离**：每个模型的工具调用在独立的 worktree 中执行

### 团队审议模式

`runDeliberation()` 的调用者传入 `sharedMessages: session.teamMessages`。每轮构建的消息为：

```
messages = [...sharedMessages, 轮次指令消息]
```

其中"轮次指令消息"：
- 起草轮：`"请起草以下文档：\n\n<task内容>"`
- 其他轮：`"请根据你的角色要求和上述文档内容，输出修改后的完整文档。不要输出任何前言或后记，直接输出文档内容。"`

每轮产出后 push 回 sharedMessages：
```
sharedMessages.push({role: "assistant", content: 本轮产出})
```

### 团队私聊模式

用户 Tab 切换到单个模型后发送消息（`src/ui/app.tsx:643-696`）：

```
teamMessages.push({role: "user", content: 用户输入})
→ runTurn({messages: teamMessages})
→ 模型回复由 runTurn 自动 push 回 teamMessages
```

## 三、系统提示词详情

### 通用系统提示词（广播模式 + 团队私聊）

```typescript
// src/ui/app.tsx:32-34
function makeSystemPrompt(modelName: string, provider: string): string {
  return `You are a helpful AI assistant. You can help with coding, writing, analysis, and creative tasks. You are the "${modelName}" model (provider: ${provider}). Respond directly to the user's request — if asked to write content, just write it; only use tools when the task genuinely requires file or command operations.`;
}
```

**注入的变量**：
- `modelName`：配置中的模型名（如 `claude`, `gpt`, `minimax`, `deepseek`）
- `provider`：对应的 Provider 名（如 `anthropic`, `openai`, `minimax`, `deepseek`）

**设计意图**：告知模型自身的身份，防止其"幻觉"为其他模型（如自称 ChatGPT 或 Claude）。

### 审议系统提示词（团队模式审议）

审议使用角色化系统提示词，由 `buildSystemPrompt()` 构建（`src/core/deliberation.ts:46-151`）：

**共同头部**：`"你正在参与一个多模型协作起草流程（R2D2：轮转审议起草）。"`

**起草者（draft）**：
```
你正在参与一个多模型协作起草流程（R2D2：轮转审议起草）。
你的角色是**起草者**。

## 任务
<用户输入的任务>
<可选：约束文档>

## 要求
- 写出一份完整的初稿
- 严格对照约束文档，确保无违规
- 覆盖任务描述中的所有要点
- 后续其他模型会在你的基础上修改，请尽量全面
- 输出完整的文档内容
```

**修订者（revise）** — 非最终轮：
```
你的角色是**修订者**。

## 原始任务
<任务>

## <起草者名> 的初稿
<上一轮产出>

## 要求
- 在初稿基础上修订，不要推倒重写
- 对照约束文档，逐条检查违规项并修正
- 补充你发现遗漏的要点
- 改进表达不清或逻辑不严谨的地方
- 在修改处用 [修订: 原文片段 → 修改后文本] 标注
- 禁止笼统赞美，只做实质性修改
- 输出完整的修订版文档
```

**修订者（revise）** — 最终轮（额外注入）：
```
## 重要：这是最后一轮
你是最终输出者。请输出一份面向用户的干净终稿：
- 直接在你的修订版正文中完成所有修改，不要使用 [修订:] 标注
- 如果之前文档中有 [修订:] 或 [补充:] 标注，将它们全部清理掉，只保留修改后的干净正文
- 文档读起来应该像一篇自然的成品，没有任何过程标记
```

**润色者（polish）** — 非最终轮：
```
你的角色是**润色者**。

## 原始任务 / 约束文档 / 经过修订的文档

## 要求
- 在现有基础上最终润色
- 再次对照约束文档做合规检查
- 优化语言流畅度和可读性
- 补充你独有的见解（标注 [补充: 你的贡献]）
- 保留所有之前的修订标注
- 输出完整的文档
```

**润色者（polish）** — 最终轮：同修订者最终轮逻辑（清理标注，产出干净终稿）。

**终审者（review）**：
```
你的角色是**终审者**（最后一轮）。

## 原始任务 / 约束文档 / 经过多轮修改的文档

## 要求
- 审查是否有修改偏离了原意
- 对照约束文档逐条再过一遍
- 清理所有 [修订:] 和 [补充:] 等过程标注，输出干净的最终版
- 如果认可某处修改，直接保留正文；如果需要回退，直接改回并保持正文流畅
- 这是一份面向用户的交付文档，不要包含任何过程标记或审查意见
- 输出最终确认版
```

**关键注入变量**：
| 变量 | 来源 | 说明 |
|------|------|------|
| `task` | `sharedMessages` 最后一条 `role: "user"` 的消息 | 从共享上下文中自动提取 |
| `previousDocument` | 本地 `documents[i-1]` | 上一轮的完整产出文本 |
| `draftAuthor` | 第一轮的 `modelName` | 用于 "XXX 的初稿" 标注 |
| `constraint` | 配置文件 `deliberation.constraint_file` | 可选的约束文档 |

**轮次配置**：
- 镜像模式（ABCBA）：`autoAssignRounds()`（`src/core/deliberation.ts:289-329`）
- 正向：A 起草 → B 修订 → C 润色 → (D 审查)
- 反向：中间模型再次修订 → A 最终审查
- 可通过 `.multiarenarc` 的 `[deliberation]` 手动指定

## 四、合并系统提示词

`/merge` 命令使用独立提示词（`src/core/deliberation.ts:356-375`），将各模型已有回答合成为一份综合文档，标注共识和分歧。

## 五、关键设计变化记录

| 版本 | 变化 |
|------|------|
| v0.1.3 之前 | 审议上下文通过 `task` 字符串参数传入；审议完成后通过 `[团队审议结果]` 手动注入到各模型的 `messages[]` |
| v0.1.3+（本次重构） | 团队模式使用共享 `teamMessages: Message[]`；审议引擎从共享上下文读取 `task`；每轮产出直接 push 回共享上下文；删除手动注入逻辑 |

### 本轮重构涉及的文件

| 文件 | 变化 |
|------|------|
| `src/core/session.ts` | 新增 `teamMessages: Message[]` 字段 + getter + 持久化 |
| `src/core/deliberation.ts` | `runDeliberation` 签名改为 `(sharedMessages, roundConfigs, constraint?, worktreePath?)`；`task` 从共享上下文提取；每轮产出 push 回 |
| `src/ui/app.tsx` | `runDeliberationPipeline` 不再接收 `task` 参数；`handleSubmit` 中所有团队交互统一 push 到 `teamMessages`；团队私聊使用 `teamMessages` 作为上下文；删除 `[团队审议结果]` 注入 |
