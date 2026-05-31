/**
 * Server communication via polling + HTTP POST.
 * Polls /api/cmd state every 2s. Submits via POST /api/cmd.
 * Simple, reliable, no SSE complexity.
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue'

export function useWebSocket() {
  const state = reactive({
    sessionId: '',
    mode: 'broadcast',
    models: [],
    deliberation: null,
    permissionPrompt: null,
    connected: false,
  })

  const currentView = ref('home')
  const sessions = ref([])
  const connectionError = ref(null)
  let mounted = true
  let pollTimer = null
  let pollFailures = 0

  function updateState(payload) {
    if (!payload) { console.warn('[poll] empty payload'); return }
    state.connected = true
    pollFailures = 0
    connectionError.value = null
    console.log('[poll] got state, models:', payload.models?.length, 'sessionId:', payload.sessionId)

    state.sessionId = payload.sessionId || ''
    state.mode = payload.mode || 'broadcast'
    state.deliberation = payload.deliberation || null
    state.permissionPrompt = payload.permissionPrompt || null

    if (payload.models && Array.isArray(payload.models)) {
      state.models.splice(0, state.models.length)
      payload.models.forEach(m => {
        state.models.push({
          name: m.name,
          buffer: m.buffer || '',
          isStreaming: !!m.isStreaming,
          usage: m.usage || null,
          muted: !!m.muted,
          messages: Array.isArray(m.messages) ? [...m.messages] : []
        })
      })
    }
  }

  async function pollState() {
    if (!mounted) return
    try {
      console.log('[poll] fetching state...')
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'state' })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      updateState(data)
    } catch (e) {
      console.error('[poll] fetch failed:', e.message)
      pollFailures++
      state.connected = false
      if (pollFailures >= 3) {
        connectionError.value = 'Cannot connect to server'
      }
    }
    if (mounted) {
      pollTimer = setTimeout(pollState, 2000)
    }
  }

  async function sendCommand(type, payload = {}) {
    try {
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...payload })
      })
      return await res.json()
    } catch (e) {
      console.error('[cmd]', e.message)
      return null
    }
  }

  async function submit(text, mode = 'broadcast', modelName = null) {
    // Fire-and-forget: server processes and state updates via polling
    sendCommand('submit', { text, mode, modelName })
    // Immediately poll for updates
    setTimeout(() => pollState(), 500)
    setTimeout(() => pollState(), 1500)
  }

  async function respondPermission(decision) {
    await sendCommand('permission', { decision })
    state.permissionPrompt = null
  }

  async function loadSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) sessions.value = await res.json()
    } catch {}
  }

  async function resumeSession(id) {
    await sendCommand('resume', { sessionId: id })
    await pollState()
    currentView.value = 'broadcast'
  }

  function disconnect() {
    mounted = false
    if (pollTimer) clearTimeout(pollTimer)
  }

  onMounted(() => {
    mounted = true
    // Use server-injected initial state if available (instant load)
    if (window.__INITIAL_STATE__) {
      updateState(window.__INITIAL_STATE__)
      delete window.__INITIAL_STATE__
    }
    // Then poll for updates
    pollState()
    loadSessions()
  })

  onUnmounted(disconnect)

  return {
    state,
    currentView,
    sessions,
    connectionError,
    submit,
    respondPermission,
    loadSessions,
    resumeSession
  }
}
