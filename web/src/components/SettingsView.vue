<script setup>
import { ref, inject, onMounted } from 'vue'

const { currentView } = inject('appState')
const t = inject('t')

const STORAGE_KEY = 'multiarena-config'
const LEGACY_KEY = 'multiarena-models'

const providers = ['Anthropic', 'OpenAI', 'Google', 'DeepSeek', 'MiniMax', 'Ollama', 'Other']
const modelConfigs = ref([])

function loadConfig() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        modelConfigs.value = parsed.map(m => ({
          nickname: m.nickname || m.name || '',
          provider: m.provider || 'Anthropic',
          apiKey: m.apiKey || '',
          modelId: m.modelId || m.name || '',
        }))
        return
      }
    } catch (e) {
      console.error('[Settings] Failed to parse config:', e)
    }
  }
  modelConfigs.value = []
}

function addModel() {
  modelConfigs.value.push({
    nickname: '',
    provider: 'Anthropic',
    apiKey: '',
    modelId: '',
  })
}

function removeModel(idx) {
  modelConfigs.value.splice(idx, 1)
}

function saveConfig() {
  const cleaned = modelConfigs.value.filter(m => m.apiKey.trim() || m.modelId.trim())
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
  localStorage.setItem('multiarena-setup-done', cleaned.length > 0 ? '1' : '')
  if (localStorage.getItem(LEGACY_KEY)) {
    localStorage.removeItem(LEGACY_KEY)
  }
  // Also save to server (.multiarenarc) so CLI and future Web sessions share config
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models: cleaned.map(m => ({
      nickname: m.nickname, provider: m.provider,
      name: m.modelId, api_key: m.apiKey
    }))})
  }).catch(() => {})
}

function goBack() {
  currentView.value = 'home'
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="settings">
    <header class="settings-top">
      <h2 class="settings-title">{{ t('models') }}</h2>
      <button class="settings-close-btn" @click="goBack">{{ t('close') }}</button>
    </header>

    <div class="settings-body">
      <div class="settings-table">
        <div class="settings-row settings-hdr">
          <span class="col-nickname">{{ t('nickname') }}</span>
          <span class="col-provider">{{ t('provider') }}</span>
          <span class="col-model">Model ID</span>
          <span class="col-apikey">{{ t('apiKey') }}</span>
          <span class="col-actions"></span>
        </div>

        <div
          v-for="(m, idx) in modelConfigs"
          :key="idx"
          class="settings-row"
        >
          <input
            v-model="m.nickname"
            class="field-nickname"
            :placeholder="t('nickname')"
          />
          <select v-model="m.provider" class="field-provider">
            <option v-for="p in providers" :key="p" :value="p">{{ p }}</option>
          </select>
          <input
            v-model="m.modelId"
            class="field-model"
            placeholder="gpt-4o"
          />
          <input
            v-model="m.apiKey"
            class="field-apikey"
            type="password"
            :placeholder="t('apiKeyHint')"
          />
          <button class="field-remove" @click="removeModel(idx)" :title="t('remove')">
            &times;
          </button>
        </div>

        <div v-if="modelConfigs.length === 0" class="settings-empty">
          {{ t('noSessions') }}
        </div>
      </div>

      <button class="settings-add-btn" @click="addModel">+ {{ t('addModel') }}</button>

      <p class="settings-privacy">{{ t('privacyNote') }}</p>
    </div>

    <footer class="settings-ftr">
      <button class="settings-save-btn" @click="saveConfig">{{ t('save') }}</button>
    </footer>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d1117;
  overflow-y: auto;
}

.settings-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 5;
}

.settings-title {
  font-size: 1rem;
  font-weight: 700;
  color: #f0f6fc;
}

.settings-close-btn {
  padding: 6px 16px;
  background: #21262d;
  border: 1px solid #30363d;
  color: #c9d1d9;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}

.settings-close-btn:hover {
  background: #30363d;
}

.settings-body {
  flex: 1;
  padding: 20px;
}

.settings-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-hdr {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8b949e;
  padding: 0 2px 6px;
}

.col-nickname { width: 100px; flex-shrink: 0; }
.col-provider { width: 110px; flex-shrink: 0; }
.col-model    { flex: 1; min-width: 80px; }
.col-apikey   { width: 180px; flex-shrink: 0; }
.col-actions  { width: 32px; flex-shrink: 0; }

.field-nickname,
.field-provider,
.field-model,
.field-apikey {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 0.8rem;
  font-family: inherit;
  padding: 6px 8px;
  outline: none;
}

.field-nickname { width: 100px; flex-shrink: 0; }
.field-provider { width: 110px; flex-shrink: 0; }
.field-model    { flex: 1; min-width: 80px; }
.field-apikey   { width: 180px; flex-shrink: 0; }

.field-nickname:focus,
.field-provider:focus,
.field-model:focus,
.field-apikey:focus {
  border-color: #58a6ff;
}

.field-provider {
  cursor: pointer;
}

.field-remove {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  color: #f85149;
  font-size: 1.2rem;
  cursor: pointer;
  border-radius: 6px;
  flex-shrink: 0;
}

.field-remove:hover {
  background: #da363322;
  border-color: #da363344;
}

.settings-empty {
  text-align: center;
  color: #484f58;
  padding: 32px 0;
  font-size: 0.85rem;
}

.settings-add-btn {
  margin-top: 12px;
  padding: 8px 16px;
  background: none;
  border: 1px dashed #30363d;
  color: #58a6ff;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  width: 100%;
}

.settings-add-btn:hover {
  border-color: #58a6ff;
  background: #1f6feb11;
}

.settings-privacy {
  margin-top: 16px;
  font-size: 0.72rem;
  color: #484f58;
  line-height: 1.5;
}

.settings-ftr {
  padding: 14px 20px;
  border-top: 1px solid #21262d;
  background: #161b22;
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
}

.settings-save-btn {
  width: 100%;
  padding: 10px;
  background: #238636;
  border: 1px solid #2ea043;
  color: #fff;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.settings-save-btn:hover {
  background: #2ea043;
}

@media (max-width: 640px) {
  .settings-row {
    flex-wrap: wrap;
  }
  .col-nickname, .col-provider, .col-model, .col-apikey,
  .field-nickname, .field-provider, .field-model, .field-apikey {
    width: auto;
    flex: 1;
    min-width: 60px;
  }
}
</style>
