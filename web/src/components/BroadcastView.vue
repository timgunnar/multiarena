<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  submit: {
    type: Function,
    required: true
  }
})

const emit = defineEmits(['back'])

const inputText = ref('')

const models = computed(() => props.state.models || [])

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  props.submit(text)
  inputText.value = ''
}

async function copyModelBuffer(model) {
  try {
    await navigator.clipboard.writeText(model.buffer || '')
  } catch {
    // clipboard API may not be available
  }
}

function formatUsage(usage) {
  if (!usage) return ''
  const inputK = usage.inputTokens ? `${(usage.inputTokens / 1000).toFixed(1)}K` : '0'
  const outputK = usage.outputTokens ? `${(usage.outputTokens / 1000).toFixed(1)}K` : '0'
  const totalK = usage.totalTokens ? `${(usage.totalTokens / 1000).toFixed(1)}K` : '0'
  return `${inputK}/${totalK} tokens`
}

const gridCols = computed(() => {
  const count = models.value.length
  if (count <= 1) return 1
  return 2
})
</script>

<template>
  <div class="broadcast">
    <header class="top-bar">
      <button class="back-btn" @click="emit('back')">&#8592; 首页</button>
      <div class="top-title">
        <span class="top-title-text">多模型广播</span>
        <span v-if="state.sessionId" class="session-badge">{{ state.sessionId }}</span>
      </div>
      <div class="top-actions">
        <button
          v-if="models.some(m => m.isStreaming)"
          class="action-btn action-btn--stop"
          title="停止"
        >
          ■ 停止
        </button>
      </div>
    </header>

    <div
      class="model-grid"
      :style="{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }"
    >
      <div
        v-for="(m, idx) in models"
        :key="m.name || idx"
        class="model-panel"
        :class="{ 'model-panel--streaming': m.isStreaming }"
      >
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="model-name">{{ m.name }}</span>
            <span class="provider-badge">{{ m.provider || 'LLM' }}</span>
          </div>
          <div class="panel-header-right">
            <span v-if="m.muted" class="muted-tag">静音</span>
          </div>
        </div>

        <div class="panel-body" ref="panelBodies">
          <pre class="buffer-text">{{ m.buffer || '' }}</pre>
          <span v-if="m.isStreaming" class="streaming-cursor">▋</span>
        </div>

        <div class="panel-footer">
          <span class="token-info">{{ formatUsage(m.usage) || '· — tokens' }}</span>
          <button class="copy-panel-btn" @click="copyModelBuffer(m)">
            📋 复制
          </button>
        </div>
      </div>
    </div>

    <div class="input-bar">
      <textarea
        v-model="inputText"
        class="followup-input"
        rows="1"
        placeholder="追问…"
        @keydown.enter.exact.prevent="handleSend"
      ></textarea>
      <button
        class="send-btn"
        @click="handleSend"
        :disabled="!inputText.trim()"
      >
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.broadcast {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  background: #fafbfc;
}

.top-bar {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  gap: 16px;
  flex-shrink: 0;
}

.back-btn {
  font-size: 13px;
  color: #7c3aed;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background 0.2s;
  white-space: nowrap;
}

.back-btn:hover {
  background: #f5f3ff;
}

.top-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.top-title-text {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-badge {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}

.top-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.action-btn:hover {
  background: #f3f4f6;
}

.action-btn--stop {
  color: #ef4444;
  border-color: #fecaca;
}

.action-btn--stop:hover {
  background: #fef2f2;
}

.model-grid {
  display: grid;
  gap: 14px;
  padding: 16px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.model-panel {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid #eeeef2;
  overflow: hidden;
  transition: border-color 0.2s;
}

.model-panel--streaming {
  border-color: #c4b5fd;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.model-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-badge {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.muted-tag {
  font-size: 11px;
  color: #9ca3af;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  min-height: 0;
  position: relative;
}

.buffer-text {
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.7;
  color: #1a1a2e;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.streaming-cursor {
  display: inline;
  color: #7c3aed;
  font-size: 14px;
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.token-info {
  font-size: 12px;
  color: #9ca3af;
}

.copy-panel-btn {
  font-size: 12px;
  color: #6b7280;
  background: none;
  border: 1px solid #e5e7eb;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.copy-panel-btn:hover {
  background: #f3f4f6;
  color: #1a1a2e;
}

.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 14px 20px 18px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.followup-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 14px;
  color: #1a1a2e;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  min-height: 42px;
  max-height: 120px;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.followup-input:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

.followup-input::placeholder {
  color: #9ca3af;
}

.send-btn {
  padding: 10px 22px;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #6d28d9;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .model-grid {
    grid-template-columns: 1fr !important;
  }

  .top-bar {
    padding: 10px 14px;
  }

  .model-grid {
    padding: 10px;
    gap: 10px;
  }

  .input-bar {
    padding: 10px 14px 14px;
  }
}
</style>
