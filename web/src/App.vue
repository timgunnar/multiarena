<script setup>
import { ref, computed, watch, provide } from 'vue'
import { useWebSocket } from './composables/useWebSocket.js'
import Sidebar from './components/Sidebar.vue'
import SetupWizard from './components/SetupWizard.vue'
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
  background: #0d1117;
  color: #c9d1d9;
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
  color: #8b949e;
  font-size: 1.2rem;
}
</style>
