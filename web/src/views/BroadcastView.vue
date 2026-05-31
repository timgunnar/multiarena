<script setup>
import { ref, computed, inject, watch, nextTick } from 'vue'

const { state, submit, respondPermission } = inject('appState')
const t = inject('t')

const inputText = ref('')
const panelRefs = ref([])

const models = computed(() => state.models || [])

const gridCols = computed(() => {
  const n = models.value.length
  if (n <= 1) return 1
  if (n <= 4) return Math.min(n, 2)
  return 3
})

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  submit(text)
  inputText.value = ''
}

function copyBuffer(model) {
  const text = model.buffer || ''
  if (!text) return
  navigator.clipboard.writeText(text).catch(() => {})
}

function formatTokens(usage) {
  if (!usage) return ''
  const parts = []
  if (usage.inputTokens) parts.push(`in:${usage.inputTokens}`)
  if (usage.outputTokens) parts.push(`out:${usage.outputTokens}`)
  return parts.join(' ') || ''
}

function setPanelRef(el, idx) {
  if (el) {
    panelRefs.value[idx] = el
  }
}

// Auto-scroll panels when streaming
watch(
  () => models.value.map(m => m.buffer),
  () => {
    nextTick(() => {
      panelRefs.value.forEach(el => {
        if (el) el.scrollTop = el.scrollHeight
      })
    })
  }
)
</script>

<template>
  <div class="broadcast">
    <!-- Top bar -->
    <header class="bc-top">
      <div class="bc-top-left">
        <span class="bc-mode-badge">{{ state.mode === 'broadcast' ? t('broadcast') : t('directed') }}</span>
        <span v-if="state.sessionId" class="bc-session">{{ state.sessionId.slice(0, 8) }}</span>
      </div>
      <div class="bc-top-right">
        <span class="bc-model-count">{{ models.length }} {{ models.length === 1 ? t('statusModel').toLowerCase() : t('models') }}</span>
      </div>
    </header>

    <!-- Model panels grid -->
    <div
      class="bc-grid"
      :style="{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }"
    >
      <div
        v-for="(m, idx) in models"
        :key="m.name || idx"
        class="bc-panel"
        :class="{ 'bc-panel--live': m.isStreaming, 'bc-panel--muted': m.muted }"
      >
        <div class="bc-panel-hdr">
          <div class="bc-panel-hdr-l">
            <span class="bc-dot" :class="{ live: m.isStreaming }"></span>
            <span class="bc-model-name">{{ m.name }}</span>
          </div>
          <div class="bc-panel-hdr-r">
            <span v-if="m.usage" class="bc-usage">{{ formatTokens(m.usage) }}</span>
            <span v-if="m.muted" class="bc-muted-tag">{{ t('muted') }}</span>
          </div>
        </div>

        <div
          class="bc-panel-body"
          :ref="(el) => setPanelRef(el, idx)"
        >
          <pre class="bc-buffer">{{ m.buffer || t('waiting') }}</pre>
          <span v-if="m.isStreaming" class="bc-cursor">&#9612;</span>
        </div>

        <div class="bc-panel-ftr">
          <button
            class="bc-copy-btn"
            @click="copyBuffer(m)"
            :disabled="!m.buffer"
          >
            {{ t('copy') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Permission overlay -->
    <div v-if="state.permissionPrompt" class="bc-perm-bar">
      <span class="bc-perm-msg">
        {{ t('statusModel') }} <strong>{{ state.permissionPrompt.modelName }}</strong>
        {{ t('wantsToRun').replace(/<[^>]+>/g, '') }}
        <code>{{ state.permissionPrompt.toolName }}</code>
      </span>
      <div class="bc-perm-actions">
        <button class="bc-perm-btn allow" @click="respondPermission('allow')">{{ t('allow') }}</button>
        <button class="bc-perm-btn allow-always" @click="respondPermission('allow_always')">{{ t('allowAlways') }}</button>
        <button class="bc-perm-btn deny" @click="respondPermission('deny')">{{ t('deny') }}</button>
        <button class="bc-perm-btn deny-always" @click="respondPermission('deny_always')">{{ t('denyAlways') }}</button>
      </div>
    </div>

    <!-- Input bar -->
    <div class="bc-input-bar">
      <textarea
        v-model="inputText"
        class="bc-input"
        rows="1"
        :placeholder="t('typeMessage')"
        @keydown.enter.exact.prevent="handleSend"
      ></textarea>
      <button
        class="bc-send"
        :disabled="!inputText.trim()"
        @click="handleSend"
      >
        {{ t('send') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.broadcast {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

/* Top bar */
.bc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--card);
  flex-shrink: 0;
}

.bc-top-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bc-mode-badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #1f6feb22;
  color: #58a6ff;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.bc-session {
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 0.72rem;
  color: #484f58;
}

.bc-top-right {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.bc-model-count {
  font-variant-numeric: tabular-nums;
}

/* Grid */
.bc-grid {
  display: grid;
  gap: 8px;
  padding: 8px;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* Panel */
.bc-panel {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--card);
  border-radius: 10px;
  overflow: hidden;
  min-height: 0;
}

.bc-panel--live {
  border-color: #1f6feb44;
}

.bc-panel--muted {
  opacity: 0.55;
}

.bc-panel-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--card);
  flex-shrink: 0;
}

.bc-panel-hdr-l {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bc-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #484f58;
  flex-shrink: 0;
}

.bc-dot.live {
  background: #3fb950;
  box-shadow: 0 0 4px #3fb950;
}

.bc-model-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bc-panel-hdr-r {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.bc-usage {
  font-size: 0.65rem;
  color: #58a6ff;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

.bc-muted-tag {
  font-size: 0.6rem;
  color: #484f58;
  background: var(--card);
  padding: 1px 5px;
  border-radius: 3px;
}

/* Panel body */
.bc-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
  position: relative;
}

.bc-buffer {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bc-cursor {
  color: #58a6ff;
  animation: blink 0.9s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.bc-panel-ftr {
  display: flex;
  justify-content: flex-end;
  padding: 6px 12px;
  border-top: 1px solid var(--card);
  flex-shrink: 0;
}

.bc-copy-btn {
  font-size: 0.7rem;
  color: var(--text-dim);
  background: none;
  border: 1px solid var(--card);
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.bc-copy-btn:hover:not(:disabled) {
  background: var(--card);
  color: var(--text);
}

.bc-copy-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* Permission bar */
.bc-perm-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #da363322;
  border-top: 1px solid #da3633;
  border-bottom: 1px solid #da3633;
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}

.bc-perm-msg {
  font-size: 0.82rem;
  color: #f85149;
}

.bc-perm-msg code {
  background: var(--card);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.78rem;
}

.bc-perm-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.bc-perm-btn {
  font-size: 0.72rem;
  padding: 5px 12px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid;
  font-weight: 600;
  transition: opacity 0.15s;
}

.bc-perm-btn:hover {
  opacity: 0.85;
}

.bc-perm-btn.allow {
  background: #238636; border-color: #2ea043; color: #fff;
}

.bc-perm-btn.allow-always {
  background: #1f6feb; border-color: #388bfd; color: #fff;
}

.bc-perm-btn.deny {
  background: #da3633; border-color: #f85149; color: #fff;
}

.bc-perm-btn.deny-always {
  background: #6e7681; border-color: var(--text-dim); color: #fff;
}

/* Input bar */
.bc-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 16px 14px;
  background: var(--surface);
  border-top: 1px solid var(--card);
  flex-shrink: 0;
}

.bc-input {
  flex: 1;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  min-height: 38px;
  max-height: 120px;
  line-height: 1.4;
}

.bc-input:focus {
  border-color: #58a6ff;
}

.bc-input::placeholder {
  color: #484f58;
}

.bc-send {
  padding: 10px 24px;
  background: #7c3aed;
  border: none;
  color: #fff;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.bc-send:hover:not(:disabled) {
  background: #6d28d9;
}

.bc-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .bc-grid {
    grid-template-columns: 1fr !important;
  }
  .bc-perm-bar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
