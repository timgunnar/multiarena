# Changelog

[English](./CHANGELOG.md) | [中文](./CHANGELOG_CN.md)

## v0.1.8

### Key Upgrades

- **Deliberation version history** — Each round now sees ALL previous drafts (with round numbers and author labels), enabling models to revert to any earlier version
- **Revision protection** — Middle rounds allow models to freely rewrite each other; final review acts as gatekeeper; follow-up edits distinguish rewrite vs. revision
- **Session persistence fixes** — `teamMessages`, `usage` stats, `muted` state, and `inputHistory` now correctly persist across session save/restore
- **Message history visibility** — User messages now appear in chat history, assistant responses survive buffer clears
- **Adversarial intensity fixes** — 2-model high mode reverse loop, `-a` flag stripped from model context, `/team -a high` shortcut from broadcast mode

### Tests

- 112 new E2E tests (broadcast 7, deliberation 11, persistence 7, cleanup 4, permission 6, merge 5, teamChat 5, appBranches 35, install 5)
- 40 files, 424 tests all passing

## v0.1.7

- **README/CHANGELOG 中英文结构调整** — 默认为英文，中文提供 `_CN` 版本，带语言切换链接

## v0.1.6

### Key Upgrades

- **Adversarial Deliberation** — Added adversarial intensity control (off/low/medium/high) and critical perspective assignment in team deliberation
  - `off` (default): pure collaboration
  - `low`: critique prompts injected in revision rounds
  - `medium`: each round outputs critique points + revisions, next round responds
  - `high`: assign critical perspectives, enable mirror adversarial rounds
- **Six Critical Perspectives** — skeptic/pragmatist/user_advocate/devils_advocate/optimist/synthesizer, auto-assigned to participating models
- **Dual Config Channels** — `.multiarenarc` `[deliberation] adversarial = "high"` or CLI `/team -a high`

### Tests

- 9 new test cases (assignPerspectives 4, autoAssignRounds adversarial 2, runDeliberation 3)
- 31 files, 339 tests all passing

---

## v0.1.5

### Key Upgrades

- **Interactive Permission Confirmation** — Tool calls prompt user before execution: [y]es allow once / [n]o deny once / [a]lways allow / [d]eny always. Cross-model shared authorization memory, broadcast mode concurrent requests auto-queued.
- **Permission Persistence** — `[a]lways` and `[d]eny always` saved to session file's `permissions` field, restored on resume, user-editable JSON.
- **README Permission Docs** — Added permission system usage guide and session file format examples.
- **README GitHub Install** — Added source install instructions (git clone + npm install + npm link).
- **CLAUDE.md Published Files Scope** — Documented npm and GitHub file inclusion/exclusion lists.

### Tests

- 18 new test cases (permission interactive 8, turn layer 4, InputBar 3, integration 3)
- 31 files, 330 tests all passing

---

## v0.1.4

### Key Upgrades

- **Team Shared Context** — Team mode adds `teamMessages` shared message thread, all models read/write the same conversation history. Deliberation engine reads context from shared history, auto-pushes output back after each round.
- **Private Think Phase** — Before each deliberation round, models do private analysis: examine the current document, identify issues, plan changes. Think output is NOT shared (invisible to other models), preventing anchoring bias.
- **"Continue Editing" Bug Fix** — After deliberation completes, entering new requirements in team overview triggers a new round that naturally sees all previous output + new instructions via shared context.
- **Context Management Docs** — Added `docs/multiarena-context-and-prompts.md` documenting model context management architecture and system prompts.

### Key Bug Fixes

- Removed `[审议结果]` manual injection logic — shared context already contains all deliberation output.
- Team directed chat (Tab to model) uses `teamMessages` as context, sharing the same thread with deliberation.

### Tests

- Added "continue editing" end-to-end test.
- 30 test files, 312 test cases all passing.

---

## v0.1.3

### Key Upgrades

- **Mode Navigation Rework** — Two top-level modes (Broadcast/Team), Tab cycles within mode (overview ↔ model), Esc returns to overview, Shift+Tab toggles modes.
- **Team Private Chat** — After deliberation, Tab to any model for continued discussion, model receives deliberation context.
- **Mirror Round Deliberation** — Multi-model forward-to-reverse relay (ABCBA), final round auto-cleans process annotations.
- **Deliberation Summary** — Each round shows change count and representative modifications, similar to git commit logs.
- **Compare Mode Exit Fix** — `d` won't incorrectly compare same model, supports wrap-around to next different model.

### Key Bug Fixes

- **Esc key not working in Windows Terminal** — Bypasses Ink's `useInput`, uses raw `process.stdin` to listen for `\x1b` bytes.
- **Shift+Tab only works from overview** — From directed mode, Shift+Tab no longer unexpectedly switches.
- Tab cycling skips muted models.
- After deliberation, Tab-sent messages no longer incorrectly trigger new deliberation.
- Broadcast mode divider rendering artifact removed.
- Deliberation view text too dim fixed, scroll support added.
- `npm pack` missing `dist/` — Created `.npmignore` to override `.gitignore` `dist/` exclusion.
- Removed residual `StatusBar.js`/`.d.ts` build artifacts, added `prebuild` cleanup step.
- Final document no longer contains process annotations like `[修订:]`/`[补充:]`.
- DeepSeek no longer misidentifies creative writing as coding tasks.
- Think-tag filtering extracted as testable pure function.

### Tests

- Mode transition tests: 48 cases
- Session tests: 28 cases (muted model skipping, all-mute edge case)
- New CLI argument parsing tests: 11 cases
- New Provider factory tests: 12 cases
- New DeliberationView component tests: 13 cases
- New Think-tag filter tests: 17 cases
- New cross-module integration tests: 19 cases
- Ollama adapter tests expanded from 4 to 15
- Permission tests: new `deny_always`, `.git-credentials`, `grep .env` coverage
- 30 test files, 311 test cases all passing.

---

## v0.1.2

### Key Upgrades

- **Team Mode** — Multi-model relay collaboration (draft → revise → polish → review), producing a polished document.
- **/merge Command** — Merge all model outputs into a comprehensive document with consensus/dissent annotations.
- **Shift+Tab Mode Toggle** — One-key switch between broadcast and team modes.
- **Project Repositioning** — From AI coding assistant to general-purpose content generation platform.
- **CHANGELOG.md** — Per-version key upgrades, bug fixes and test coverage.

### Key Bug Fixes

- Shift+Tab not working on some Windows terminals, added raw sequence fallback.
- Removed dead code `StatusBar.tsx`, extracted `formatTokens`.
- Removed unused `cycleTargetReverse` method.
- Removed `Ctrl+O`/`Ctrl+S` redundant shortcuts.

### Tests

- 11 deliberation test cases (autoAssignRounds, runDeliberation, event sequence, constraint injection, error handling).
- 24 test files, 164 test cases all passing.

---

## v0.1.1

### Key Upgrades

- **MiniMax, DeepSeek Providers** — All 6 providers connected.
- **Token Usage Display** — Real-time token consumption shown for each model in broadcast and directed views.
- **Context Waterline Configurable** — `context_limit` option with color warning on threshold.
- **Provider Timeout & Retry** — Auto-abort on timeout with retry strategy.
- **Input History Navigation** — `↑↓` to browse input history.
- **Scroll Offset** — `↑↓` to scroll long output in directed mode.
- **Shortcut Hints** — Persistent shortcut help in input bar.
- **Session Persistence** — Auto-save on `q` exit, `--resume` to restore.
- **Orphan Worktree Cleanup** — Auto-remove stale worktrees from prior crashes on startup.
- **CLI Arguments** — `--help`/`--version` support.
- **Config Validation** — Startup warnings for missing models or API keys.

### Key Bug Fixes

- Bash tool hanging on empty command, now gracefully rejected.
- Reasoning model `think` tags mistakenly displayed as output, added filtering.
- Tool call empty parameters causing exceptions, added fallback handling.
- MiniMax China region endpoint corrected to `minimax.chat`.
- Google Gemini tool result role should be `function` not `tool`.
- Google Gemini missing tool-call loop handling.
- npm bin path extra `./` prefix causing install warnings.

### Tests

- Session persistence tests (save/load/list, 5 cases).
- `runTurn` tool-call loop tests (6 cases).
- UI component tests (InputBar, formatTokens).
- Tool tests (readFile, grep, bash, writeFile, editFile).
- Worktree isolation tests (5 cases).
- Permission tests (5 cases).
- 24 test files, 164 test cases all passing.

---

## v0.1.0

### Key Upgrades

- **First Usable Version** — Terminal-native multi-model AI assistant officially released.
- **Broadcast Mode** — Messages sent to all models simultaneously, side-by-side panel comparison.
- **Directed Mode** — Tab to select a single model for conversation, full-width detail view.
- **6 Providers** — Anthropic, OpenAI, Google, DeepSeek, MiniMax, Ollama.
- **Provider Unified Interface** — AsyncGenerator + Adapter pattern, adding a new provider only requires implementing `chat()`.
- **git Worktree Isolation** — Each model runs in an independent worktree, no filesystem conflicts.
- **6 Built-in Tools** — bash, read, write, edit, glob, grep.
- **Permission Management** — Session-memory authorized operations, cross-model shared.
- **TOML Configuration** — `.multiarenarc` file, supports `${ENV}` variables and global/project-level override.
- **Conversation History** — Each model maintains independent full context.

### Key Bug Fixes

- Anthropic adapter `AbortController` reused aborted instances on consecutive calls, now created per-call.
- TOML config merge logic incomplete, added `DEFAULT_CONFIG` fallback.
- Fixed ESM module format and TypeScript type imports.

### Tests

- Anthropic Provider adapter tests (including abort scenarios).
- TOML config loading and default value merge tests.
