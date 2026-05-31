<script setup>
import { ref, computed, watch, provide, onMounted } from 'vue'
import { useWebSocket } from './composables/useWebSocket.js'
import { useI18n } from './composables/useI18n.js'
import Sidebar from './components/Sidebar.vue'
import SetupWizard from './components/SetupWizard.vue'
import SettingsView from './components/SettingsView.vue'
import PermissionDialog from './components/PermissionDialog.vue'
import ConnectionBanner from './components/ConnectionBanner.vue'
import HomeView from './views/HomeView.vue'
import BroadcastView from './views/BroadcastView.vue'
import DeliberationView from './views/DeliberationView.vue'

const {
  state,
  currentView,
  sessions,
  connectionError,
  submit,
  respondPermission,
  loadSessions,
  resumeSession,
  connect
} = useWebSocket()

const { t, locale, setLocale, localeLabel } = useI18n()

const sidebarCollapsed = ref(false)
const showSetup = ref(false)

const hasModels = computed(() => state.models.length > 0)
const hasSession = computed(() => !!state.sessionId)

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function onSetupComplete() {
  showSetup.value = false
}

const darkMode = ref(localStorage.getItem('multiarena-theme') !== 'light')

function applyTheme() {
  document.documentElement.dataset.theme = darkMode.value ? 'dark' : 'light'
}

function toggleTheme() {
  darkMode.value = !darkMode.value
  localStorage.setItem('multiarena-theme', darkMode.value ? 'dark' : 'light')
  applyTheme()
}

onMounted(applyTheme)

function toggleLocale() {
  setLocale(locale.value === 'zh' ? 'en' : 'zh')
}

watch(state, () => {
  if (!hasModels.value && !hasSession.value) {
    showSetup.value = true
  }
}, { immediate: true })

provide('appState', {
  state,
  currentView,
  sessions,
  connectionError,
  submit,
  respondPermission,
  loadSessions,
  resumeSession,
  connect,
  sidebarCollapsed,
  toggleSidebar
})

provide('locale', locale)
provide('darkMode', darkMode)
provide('toggleTheme', toggleTheme)
provide('t', t)
</script>

<template>
  <div class="app-shell">
    <SetupWizard
      v-if="showSetup"
      @complete="onSetupComplete"
      @skip="showSetup = false"
    />
    <template v-else>
      <Sidebar />
      <div class="main-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
        <ConnectionBanner />
        <main class="view-container">
          <HomeView v-if="currentView === 'home'" />
          <BroadcastView v-else-if="currentView === 'broadcast'" />
          <DeliberationView v-else-if="currentView === 'deliberation'" />
          <SettingsView v-else-if="currentView === 'settings'" />
          <div v-else class="view-placeholder">
            <p>Unknown view: {{ currentView }}</p>
          </div>
        </main>
      </div>
      <PermissionDialog />
    </template>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  transition: margin-left 0.2s ease;
}

.view-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.view-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-dim);
  font-size: 1.2rem;
}
</style>
