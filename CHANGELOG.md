# Changelog

## v0.1.2

### 关键升级

- **团队模式** — 多模型接力协作（起草 → 修订 → 润色 → 审查），产出一份经过多重打磨的文档
- **/merge 合并命令** — 将各模型已有的回答合并为一份综合文档，标注共识和分歧
- **Shift+Tab 模式切换** — 广播模式与团队模式一键切换，输入 `/team` 也可切换
- **项目重新定位** — 从 AI 编程助手转向通用内容生成平台
- **CHANGELOG.md** — 按版本记录关键升级、Bug 修复和测试覆盖

### 关键 Bug 修复

- Shift+Tab 在部分 Windows 终端上不生效，增加原始序列监听作为兜底
- 删除死代码 `StatusBar.tsx`，提取 `formatTokens` 到独立文件
- 移除 `cycleTargetReverse` 无用方法
- 移除 `Ctrl+O` / `Ctrl+S` 多余快捷键，保持交互简洁

### 测试

- 新增 11 个 deliberation 测试用例（`autoAssignRounds`、`runDeliberation`、事件序列、约束注入、错误处理）
- 全部 24 个测试文件、164 个测试用例通过

---

## v0.1.1

### 关键升级

- **MiniMax、DeepSeek Provider** — 6 家厂商全部接入
- **Token 用量实时显示** — 广播和定向视图均显示每模型的 token 消耗
- **上下文水位可配置** — `context_limit` 支持自定义，超出阈值有颜色预警
- **Provider 超时与重试** — 请求超时自动中断，支持重试策略
- **输入历史导航** — `↑↓` 键浏览历史输入
- **滚动偏移** — 定向模式下 `↑↓` 可滚动查看长输出
- **快捷键提示** — InputBar 底部常驻快捷键说明
- **会话持久化** — `q` 退出自动保存，`--resume` 恢复历史会话
- **孤儿 worktree 清理** — 启动时自动扫除上次崩溃遗留的 worktree
- **CLI 参数** — `--help` / `--version` 支持
- **配置校验** — 启动时警告缺失的模型或 API key

### 关键 Bug 修复

- bash 工具空命令导致 hang，改为优雅拒绝
- 推理模型（DeepSeek-R1 等）的 `think` 标签被误当作正文输出，增加过滤
- 工具调用参数为空时导致异常，增加兜底处理
- MiniMax 中国区端点错误，改为 `minimax.chat`
- Google Gemini 工具结果角色应为 `function` 而非 `tool`
- Google Gemini 缺少工具调用循环处理
- npm bin 路径多余 `./` 前缀导致安装警告

### 测试

- 新增 session 持久化测试（保存/加载/列表，5 个用例）
- 新增 `runTurn` 工具调用循环测试（6 个用例）
- 新增 UI 组件测试（`InputBar`、`formatTokens`）
- 新增工具测试（`readFile`、`grep`、`bash`、`writeFile`、`editFile`）
- 新增 `worktree` 隔离测试（5 个用例）
- 新增 `permission` 权限测试（5 个用例）
- 全部 24 个测试文件、164 个测试用例通过

---

## v0.1.0

### 关键升级

- **首个可用版本** — 终端原生多模型 AI 助手正式发布
- **广播模式** — 消息同时发给所有模型，分栏并排查看回答
- **定向模式** — Tab 切换选择单一模型对话，全宽详情视图
- **6 家 Provider** — Anthropic、OpenAI、Google、DeepSeek、MiniMax、Ollama
- **Provider 统一接口** — AsyncGenerator + Adapter 模式，新增厂商只需实现 `chat()` 方法
- **git worktree 隔离** — 每个模型运行在独立的 worktree 中，文件系统无冲突
- **6 个内置工具** — bash、read、write、edit、glob、grep
- **权限管理** — 会话内记忆已授权操作，跨模型共享
- **TOML 配置** — `.multiarenarc` 文件，支持 `${ENV}` 环境变量和全局/项目级覆盖
- **对话历史** — 每个模型独立维护完整上下文

### 关键 Bug 修复

- Anthropic adapter 的 `AbortController` 在连续调用时会复用已中止的实例，改为每次调用新建
- TOML 配置合并逻辑不完整，改用 `DEFAULT_CONFIG` 兜底
- 修复 ESM 模块格式和 TypeScript 类型导入

### 测试

- Anthropic Provider 适配器测试（含 abort 场景）
- TOML 配置加载与默认值合并测试
