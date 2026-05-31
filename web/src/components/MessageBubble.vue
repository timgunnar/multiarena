<script setup>
import { ref } from 'vue'

const props = defineProps({
  role: {
    type: String,
    required: true,
    validator: v => ['user', 'model'].includes(v)
  },
  name: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    required: true
  },
  tokens: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: String,
    default: ''
  }
})

const copied = ref(false)

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.content)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch {
    // clipboard API may not be available
  }
}

function formatTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
</script>

<template>
  <div
    class="bubble"
    :class="{
      'bubble--user': role === 'user',
      'bubble--model': role === 'model'
    }"
  >
    <div v-if="role === 'model'" class="bubble-header">
      <span class="bubble-name">{{ name }}</span>
      <span v-if="tokens > 0" class="bubble-tokens">· {{ formatTokens(tokens) }} tokens</span>
    </div>

    <div class="bubble-body">
      <div class="bubble-content">{{ content }}</div>
    </div>

    <div class="bubble-footer">
      <span v-if="timestamp" class="bubble-time">{{ timestamp }}</span>
      <button class="copy-btn" @click="handleCopy">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bubble {
  margin-bottom: 14px;
  max-width: 85%;
  border-radius: 12px;
  padding: 14px 16px;
  word-break: break-word;
}

.bubble--user {
  margin-left: auto;
  background: #f5f3ff;
  border-left: 3px solid #7c3aed;
}

.bubble--model {
  margin-right: auto;
  background: #f3f4f6;
}

.bubble-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.bubble-name {
  font-size: 13px;
  font-weight: 600;
  color: #7c3aed;
}

.bubble-tokens {
  font-size: 11px;
  color: #9ca3af;
}

.bubble-content {
  font-size: 14px;
  line-height: 1.65;
  color: #1a1a2e;
  white-space: pre-wrap;
}

.bubble-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.bubble-time {
  font-size: 11px;
  color: #9ca3af;
}

.copy-btn {
  font-size: 12px;
  color: #6b7280;
  background: none;
  border: 1px solid #e5e7eb;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.copy-btn:hover {
  background: #f3f4f6;
  color: #1a1a2e;
}
</style>
