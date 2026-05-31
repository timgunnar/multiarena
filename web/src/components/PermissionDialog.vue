<script setup>
import { inject } from 'vue'

const { state, respondPermission } = inject('appState')
const t = inject('t')
</script>

<template>
  <Teleport to="body">
    <div v-if="state.permissionPrompt" class="perm-overlay" @click.self="respondPermission('deny')">
      <div class="perm-dialog">
        <h3 class="perm-title">{{ t('permissionRequired') }}</h3>

        <div class="perm-model">
          <span class="perm-label">{{ t('statusModel') }}</span>
          <span class="perm-value">{{ state.permissionPrompt.modelName }}</span>
        </div>

        <div class="perm-tool">
          <span class="perm-label">{{ t('tool') }}</span>
          <code class="perm-tool-name">{{ state.permissionPrompt.toolName }}</code>
        </div>

        <div v-if="state.permissionPrompt.args" class="perm-args">
          <span class="perm-label">{{ t('arguments') }}</span>
          <pre class="perm-args-text">{{ JSON.stringify(state.permissionPrompt.args, null, 2) }}</pre>
        </div>

        <div class="perm-actions">
          <button class="perm-btn allow" @click="respondPermission('allow')">
            {{ t('allowOnce') }}
          </button>
          <button class="perm-btn allow-always" @click="respondPermission('allow_always')">
            {{ t('allowAlways') }}
          </button>
          <button class="perm-btn deny" @click="respondPermission('deny')">
            {{ t('deny') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.perm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(2px);
}

.perm-dialog {
  width: 440px;
  max-width: 92vw;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 28px 22px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}

.perm-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--card);
}

.perm-model,
.perm-tool,
.perm-args {
  margin-bottom: 14px;
}

.perm-label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.perm-value {
  font-size: 0.9rem;
  color: var(--text);
  font-weight: 600;
}

.perm-tool-name {
  font-size: 0.85rem;
  background: var(--card);
  color: var(--primary-hover);
  padding: 3px 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}

.perm-args-text {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.75rem;
  color: var(--text-dim);
  background: var(--bg);
  border: 1px solid var(--card);
  border-radius: 6px;
  padding: 10px;
  max-height: 160px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.perm-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--card);
}

.perm-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid;
  transition: opacity 0.15s;
  text-align: center;
}

.perm-btn:hover {
  opacity: 0.85;
}

.perm-btn.allow {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
}

.perm-btn.allow-always {
  background: var(--primary);
  border-color: var(--primary-hover);
  color: #fff;
}

.perm-btn.deny {
  background: var(--card);
  border-color: var(--border);
  color: var(--text);
}
</style>
