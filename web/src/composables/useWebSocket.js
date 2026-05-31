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
      // Only show disconnected after 5+ consecutive failures (avoid transient glitches)
      if (pollFailures >= 5) {
        state.connected = false
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
    try {
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'submit', text, mode, modelName })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Read streamed NDJSON response — same pattern as CLI's for-await
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
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
            } else if (event.type === 'done' || event.type === 'error') {
              // handled
            }
          } catch {}
        }
      }
    } catch (e) {
      console.error('[submit]', e.message)
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
