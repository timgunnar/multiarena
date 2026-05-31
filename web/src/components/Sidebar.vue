<script setup>
import { inject, ref, computed, onMounted } from 'vue'

const {
  state,
  currentView,
  sessions,
  submit,
  loadSessions,
  resumeSession,
  sidebarCollapsed,
  toggleSidebar
} = inject('appState')

const t = inject('t')
const locale = inject('locale')
const darkMode = inject('darkMode')
const toggleTheme = inject('toggleTheme')
const localeLabel = computed(() => locale.value === 'zh' ? 'EN' : '中')

function toggleLocale() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('multiarena-locale', locale.value)
}

const sessionsLoaded = ref(false)

const modelCount = computed(() => state.models.length)
const activeModels = computed(() => state.models.filter(m => !m.muted).length)
const isConnected = computed(() => state.connected)

onMounted(async () => {
  await loadSessions()
  sessionsLoaded.value = true
})

function navTo(view) {
  currentView.value = view
}

function onResumeSession(id) {
  resumeSession(id)
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
    <div class="sidebar-header">
      <button
        class="toggle-btn"
        @click="toggleSidebar"
        :title="sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')"
      >
        <span v-if="sidebarCollapsed">&#9776;</span>
        <span v-else>&#10005;</span>
      </button>
      <span v-if="!sidebarCollapsed" class="brand">multiarena</span>
      <button
        v-if="!sidebarCollapsed"
        class="lang-btn"
        @click="toggleTheme"
        :title="darkMode ? 'Light' : 'Dark'"
      >
        {{ darkMode ? '☀' : '🌙' }}
      </button>
      <button
        v-if="!sidebarCollapsed"
        class="lang-btn"
        @click="toggleLocale"
        :title="t('languageSwitch')"
      >
        {{ localeLabel }}
      </button>
    </div>

    <div v-if="!sidebarCollapsed" class="sidebar-body">
      <section class="nav-section">
        <h3 class="section-title">{{ t('views') }}</h3>
        <nav class="nav-links">
          <button
            class="nav-link"
            :class="{ active: currentView === 'home' }"
            @click="navTo('home')"
          >
            <span class="nav-icon">&#8962;</span>
            {{ t('home') }}
          </button>
          <button
            class="nav-link"
            :class="{ active: currentView === 'deliberation' }"
            @click="navTo('deliberation')"
          >
            <span class="nav-icon">&#9881;</span>
            {{ t('deliberation') }}
          </button>
          <button
            class="nav-link"
            :class="{ active: currentView === 'settings' }"
            @click="navTo('settings')"
          >
            <span class="nav-icon">&#9874;</span>
            {{ t('settings') }}
          </button>
        </nav>
      </section>

      <section v-if="modelCount > 0" class="models-section">
        <h3 class="section-title">{{ t('models') }} ({{ activeModels }}/{{ modelCount }})</h3>
        <ul class="model-list">
          <li
            v-for="model in state.models"
            :key="model.name"
            class="model-item"
            :class="{ streaming: model.isStreaming, muted: model.muted }"
          >
            <span class="model-status" :class="{ active: model.isStreaming }"></span>
            <span class="model-name">{{ model.name }}</span>
            <span v-if="model.muted" class="muted-badge">{{ t('muted') }}</span>
            <span v-if="model.usage" class="usage-badge">
              {{ model.usage.inputTokens || 0 }}+{{ model.usage.outputTokens || 0 }}
            </span>
          </li>
        </ul>
      </section>

      <section class="sessions-section">
        <h3 class="section-title">
          {{ t('sessions') }}
          <button class="refresh-btn" @click="loadSessions" :title="t('refresh')">
            &#8635;
          </button>
        </h3>
        <div v-if="!sessionsLoaded" class="sessions-loading">{{ t('loading') }}</div>
        <div v-else-if="sessions.length === 0" class="sessions-empty">
          {{ t('noSessions') }}
        </div>
        <ul v-else class="session-list">
          <li
            v-for="s in sessions"
            :key="s.id"
            class="session-item"
            @click="onResumeSession(s.id)"
          >
            <div class="session-id">{{ s.id.slice(0, 8) }}...</div>
            <div class="session-meta">
              <span class="session-models">
                {{ (s.models || []).map(m => m.name).join(', ') }}
              </span>
              <span v-if="s.timestamp" class="session-time">
                {{ new Date(s.timestamp).toLocaleDateString() }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <section class="status-section">
        <div class="connection-status" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          {{ isConnected ? t('connected') : t('disconnected') }}
        </div>
        <div v-if="state.mode" class="mode-badge">
          {{ state.mode === 'directed' ? t('directed') : t('broadcast') }}
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  flex-shrink: 0;
}

.sidebar.collapsed {
  width: 44px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  min-height: 48px;
}

.toggle-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 4px 6px;
  border-radius: 4px;
  line-height: 1;
}

.toggle-btn:hover {
  color: var(--text);
  background: var(--card);
}

.brand {
  margin-left: 10px;
  font-weight: 700;
  font-size: 1rem;
  color: #58a6ff;
  white-space: nowrap;
  flex: 1;
}

.lang-btn {
  margin-left: auto;
  background: none;
  border: 1px solid var(--border);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.lang-btn:hover {
  color: var(--text);
  border-color: #58a6ff;
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  padding: 12px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: var(--text);
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  text-align: left;
  width: 100%;
}

.nav-link:hover:not(:disabled) {
  background: var(--card);
}

.nav-link.active {
  background: #1f6feb33;
  color: #58a6ff;
}

.nav-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-icon {
  font-size: 0.9rem;
  width: 18px;
  text-align: center;
}

.model-list {
  list-style: none;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.model-item.streaming {
  color: var(--text);
  background: #1f6feb11;
}

.model-item.muted {
  opacity: 0.5;
}

.model-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #484f58;
  flex-shrink: 0;
}

.model-status.active {
  background: #3fb950;
  box-shadow: 0 0 4px #3fb950;
}

.model-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted-badge {
  font-size: 0.6rem;
  background: var(--border);
  color: var(--text-dim);
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.usage-badge {
  font-size: 0.6rem;
  color: #58a6ff;
  flex-shrink: 0;
}

.sessions-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sessions-loading,
.sessions-empty {
  padding: 8px 12px;
  font-size: 0.8rem;
  color: #484f58;
}

.session-list {
  list-style: none;
  padding: 0 8px;
  overflow-y: auto;
  flex: 1;
}

.session-item {
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  border: 1px solid transparent;
}

.session-item:hover {
  background: var(--card);
  border-color: var(--border);
}

.session-id {
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  color: #58a6ff;
  margin-bottom: 2px;
}

.session-meta {
  display: flex;
  justify-content: space-between;
  color: #484f58;
  font-size: 0.7rem;
}

.session-models {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.refresh-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 2px 4px;
  border-radius: 3px;
}

.refresh-btn:hover {
  color: var(--text);
  background: var(--card);
}

.status-section {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f85149;
}

.connection-status.connected {
  color: #3fb950;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.mode-badge {
  background: #1f6feb33;
  color: #58a6ff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
