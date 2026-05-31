<script setup>
import { ref, inject, onMounted, watch } from 'vue'

const appState = inject('appState')
const { currentView } = appState
const t = inject('t')

const STORAGE_KEY = 'multiarena-config'
const LEGACY_KEY = 'multiarena-models'
const providers = ['Anthropic', 'OpenAI', 'Google', 'DeepSeek', 'MiniMax', 'Ollama', 'Other']

// ── Server models (read-only, from .multiarenarc via __INITIAL_STATE__) ──
const serverModels = ref([])

function loadServerModels(source) {
  if (!source || !Array.isArray(source)) return
  const models = source.map(m => ({
    name: m.name,
    provider: m.provider || '',
    isStreaming: !!m.isStreaming,
    muted: !!m.muted,
  }))
  if (models.length > 0) {
    serverModels.value = models
  }
}

// ── User models (editable, from localStorage) ──
const userModels = ref([])

function loadUserModels() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed : (parsed.models ?? [])
    userModels.value = list.map(m => ({
      nickname: m.nickname || m.name || '',
      provider: m.provider || 'Anthropic',
      apiKey: m.api_key || m.apiKey || '',
      modelId: m.modelId || m.name || '',
    }))
  } catch (e) {
    console.error('[Settings] Failed to parse localStorage config:', e)
  }
}

// Watch reactive state for async updates (polling populates state.models after mount)
watch(
  () => appState?.state?.models,
  (newModels) => {
    if (newModels && newModels.length > 0) {
      loadServerModels(newModels)
    }
  },
  { immediate: false }
)

function addModel() {
  userModels.value.push({
    nickname: '',
    provider: 'Anthropic',
    apiKey: '',
    modelId: '',
  })
}

function removeModel(idx) {
  userModels.value.splice(idx, 1)
}

function saveConfig() {
  const cleaned = userModels.value.filter(m => m.apiKey.trim() || m.modelId.trim())
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
  localStorage.setItem('multiarena-setup-done', cleaned.length > 0 ? '1' : '')
  if (localStorage.getItem(LEGACY_KEY)) {
    localStorage.removeItem(LEGACY_KEY)
  }
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
  // 1. Read server models from the HTML-embedded initial state (available immediately)
  if (window.__INITIAL_STATE__?.models) {
    loadServerModels(window.__INITIAL_STATE__.models)
  }
  // 2. Also try the reactive state in case __INITIAL_STATE__ was already consumed
  if (serverModels.value.length === 0 && appState?.state?.models?.length > 0) {
    loadServerModels(appState.state.models)
  }
  // 3. Load user models from localStorage
  loadUserModels()
  // 4. If nothing at all, add one empty row as starting point
  if (serverModels.value.length === 0 && userModels.value.length === 0) {
    userModels.value.push({ nickname: '', provider: 'Anthropic', apiKey: '', modelId: '' })
  }
})
</script>

<template>
  <div class="settings">
    <header class="settings-top">
      <h2 class="settings-title">{{ t('models') }}</h2>
      <button class="settings-close-btn" @click="goBack">{{ t('close') }}</button>
    </header>

    <div class="settings-body">
      <!-- ═══ Server Models (read-only) ═══ -->
      <section v-if="serverModels.length > 0" class="settings-section">
        <h3 class="section-heading">{{ t('serverModels') }}</h3>
        <p class="section-note">{{ t('apiKeyServerNote') }}</p>
        <div class="server-model-list">
          <div
            v-for="m in serverModels"
            :key="'srv-' + m.name"
            class="server-model-card"
          >
            <div class="sm-info">
              <span class="sm-name">{{ m.name }}</span>
              <span class="sm-provider">{{ m.provider || t('serverConfigured') }}</span>
            </div>
            <div class="sm-status">
              <span v-if="m.isStreaming" class="badge badge-streaming">{{ t('streaming') }}</span>
              <span v-else-if="m.muted" class="badge badge-muted">{{ t('muted') }}</span>
              <span v-else class="badge badge-ready">{{ t('ready') }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ User Models (editable) ═══ -->
      <section v-if="userModels.length > 0" class="settings-section">
        <h3 class="section-heading">{{ t('userModels') }}</h3>
        <div class="settings-table glass">
          <div class="settings-row settings-hdr">
            <span class="col-nickname">{{ t('nickname') }}</span>
            <span class="col-provider">{{ t('provider') }}</span>
            <span class="col-model">{{ t('modelId') }}</span>
            <span class="col-apikey">{{ t('apiKey') }}</span>
            <span class="col-actions"></span>
          </div>

          <div
            v-for="(m, idx) in userModels"
            :key="'usr-' + idx"
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
        </div>

        <button class="settings-add-btn" @click="addModel">+ {{ t('addModel') }}</button>
        <p class="settings-privacy">{{ t('privacyNote') }}</p>
      </section>

      <!-- ═══ Empty state ═══ -->
      <div v-if="serverModels.length === 0 && userModels.length === 0" class="settings-empty-full">
        <p class="empty-title">{{ t('noModels') }}</p>
        <button class="empty-cta" @click="addModel">+ {{ t('addModel') }}</button>
      </div>
    </div>

    <footer v-if="userModels.length > 0" class="settings-ftr">
      <button class="settings-save-btn" @click="saveConfig">{{ t('save') }}</button>
    </footer>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  overflow-y: auto;
}

.settings-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--card);
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
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}

.settings-close-btn:hover {
  background: var(--border);
}

.settings-body {
  flex: 1;
  padding: 20px;
}

/* ── Sections ── */

.settings-section {
  margin-bottom: 28px;
}

.settings-section + .settings-section {
  border-top: 1px solid var(--card);
  padding-top: 24px;
}

.section-heading {
  font-size: 0.85rem;
  font-weight: 600;
  color: #c9d1d9;
  margin: 0 0 4px;
}

.section-note {
  margin: 0 0 12px;
  font-size: 0.7rem;
  color: #484f58;
  line-height: 1.5;
}

/* ── Server Model Cards ── */

.server-model-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.server-model-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--card);
  border-radius: 8px;
  transition: border-color 0.15s;
}

.server-model-card:hover {
  border-color: #30363d;
}

.sm-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sm-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e6edf3;
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}

.sm-provider {
  font-size: 0.7rem;
  color: #8b949e;
  padding: 2px 8px;
  background: var(--bg);
  border-radius: 4px;
  white-space: nowrap;
}

.sm-status {
  flex-shrink: 0;
  margin-left: 12px;
}

/* ── Badges ── */

.badge {
  font-size: 0.68rem;
  padding: 3px 10px;
  border-radius: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.badge-ready {
  background: #1b38264d;
  color: #3fb950;
  border: 1px solid #3fb95044;
}

.badge-streaming {
  background: #1f3a5f4d;
  color: #58a6ff;
  border: 1px solid #58a6ff44;
}

.badge-muted {
  background: #3b2e1a4d;
  color: #d29922;
  border: 1px solid #d2992244;
}

/* ── Editable Table ── */

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
  color: var(--text-dim);
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
  background: var(--bg);
  border: 1px solid var(--card);
  border-radius: 6px;
  color: var(--text);
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

.settings-add-btn {
  margin-top: 12px;
  padding: 8px 16px;
  background: none;
  border: 1px dashed var(--border);
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

/* ── Empty state ── */

.settings-empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
}

.empty-title {
  font-size: 0.9rem;
  color: #484f58;
  margin: 0 0 16px;
}

.empty-cta {
  padding: 8px 24px;
  background: none;
  border: 1px dashed var(--border);
  color: #58a6ff;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
}

.empty-cta:hover {
  border-color: #58a6ff;
  background: #1f6feb11;
}

/* ── Footer ── */

.settings-ftr {
  padding: 14px 20px;
  border-top: 1px solid var(--card);
  background: var(--surface);
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

/* ── Responsive ── */

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
  .server-model-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .sm-status {
    margin-left: 0;
  }
}
</style>
