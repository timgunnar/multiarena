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
      return await res.json()
    } catch {
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

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (mounted) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === 'state') {
              updateState(event)
            } else if (event.type === 'stream') {
              const m = state.models.find(mm => mm.name === event.modelName)
              if (m) m.buffer += event.text || ''
            } else if (event.type === 'stream_end') {
              const m = state.models.find(mm => mm.name === event.modelName)
              if (m) { m.isStreaming = false; if (event.usage) m.usage = event.usage }
            } else if (event.type === 'deliberation') {
              state.deliberation = event.event
              currentView.value = 'deliberation'
            } else if (event.type === 'permission_required') {
              state.permissionPrompt = event
            }
          } catch {}
        }
      }
      // Refresh state after submit completes
      const data = await sendCommand('state')
      if (data) updateState(data)
    } catch (e) {
      connectionError.value = 'Submit failed: ' + e.message
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
    } catch {}
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
      updateState(window.__INITIAL_STATE__)
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
