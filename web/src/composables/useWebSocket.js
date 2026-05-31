/**
 * Server communication — initial state injection + streaming submit.
 * No polling. No SSE. "Connection" is implied by the submit stream.
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

  function updateState(payload) {
    if (!payload) return
    state.connected = true
    connectionError.value = null
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

  async function sendCommand(type, payload = {}) {
    try {
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...payload })
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[sendCommand] ${type} HTTP ${res.status}:`, errText)
        return null
      }
      return await res.json()
    } catch (e) {
      console.error(`[sendCommand] ${type} failed:`, e)
      return null
    }
  }

  async function submit(text, mode = 'broadcast', modelName = null) {
    connectionError.value = null
    try {
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'submit', text, mode, modelName })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Poll for updates while models are streaming
      let polling = true
      while (polling) {
        await new Promise(r => setTimeout(r, 500))
        const data = await sendCommand('state')
        if (!data) { polling = false; break }
        updateState(data)
        // Stop if no models are streaming
        polling = data.models?.some(m => m.isStreaming) ?? false
      }
      // Final refresh
      const data = await sendCommand('state')
      if (data) updateState(data)
    } catch (e) {
      connectionError.value = 'Submit failed: ' + e.message
      console.error('[submit]', e)
    }
  }

  async function respondPermission(decision) {
    await sendCommand('permission', { decision })
    state.permissionPrompt = null
  }

  async function loadSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) sessions.value = await res.json()
    } catch (err) {
      console.error('[useWebSocket] loadSessions failed:', err)
    }
  }

  async function resumeSession(id) {
    await sendCommand('resume', { sessionId: id })
    const data = await sendCommand('state')
    if (data) updateState(data)
    currentView.value = 'broadcast'
  }

  onMounted(() => {
    mounted = true
    // Server injects initial state into HTML — load instantly
    if (window.__INITIAL_STATE__) {
      try {
        updateState(window.__INITIAL_STATE__)
      } catch (err) {
        console.error('[useWebSocket] Failed to parse __INITIAL_STATE__:', err)
      }
      delete window.__INITIAL_STATE__
    }
    loadSessions()
  })

  onUnmounted(() => {
    mounted = false
  })

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
