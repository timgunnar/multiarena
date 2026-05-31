/**
 * Server communication via fetch + SSE streaming.
 * Uses fetch with ReadableStream instead of EventSource for reliability.
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
  let abortController = null
  let pollTimer = null

  function ensureModel(name) {
    let m = state.models.find(mm => mm.name === name)
    if (!m) {
      m = { name, buffer: '', isStreaming: false, usage: null, muted: false, messages: [] }
      state.models.push(m)
    }
    return m
  }

  function findModel(name) {
    return state.models.find(mm => mm.name === name)
  }

  function handleEvent(eventType, data) {
    try {
      const payload = JSON.parse(data)

      switch (eventType) {
        case 'state': {
          const s = payload
          state.sessionId = s.sessionId || ''
          state.mode = s.mode || 'broadcast'
          state.deliberation = s.deliberation || null
          state.permissionPrompt = s.permissionPrompt || null

          if (s.models && Array.isArray(s.models)) {
            state.models.splice(0, state.models.length)
            s.models.forEach(m => {
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

          if (!state.sessionId) currentView.value = 'home'
          break
        }

        case 'stream': {
          const model = ensureModel(payload.modelName)
          if (payload.text) model.buffer += payload.text
          model.isStreaming = true
          if (currentView.value === 'home' && state.models.length > 0) {
            currentView.value = 'broadcast'
          }
          break
        }

        case 'stream_end': {
          const model = findModel(payload.modelName)
          if (model) {
            model.isStreaming = false
            if (payload.usage) model.usage = payload.usage
          }
          break
        }

        case 'deliberation': {
          state.deliberation = payload.event || payload
          currentView.value = 'deliberation'
          break
        }

        case 'permission_required': {
          state.permissionPrompt = {
            requestId: payload.requestId,
            toolName: payload.toolName,
            args: payload.args,
            modelName: payload.modelName
          }
          break
        }

        case 'error': {
          connectionError.value = payload.message
          break
        }

        case 'done': {
          state.models.forEach(m => { m.isStreaming = false })
          state.deliberation = null
          state.permissionPrompt = null
          break
        }
      }
    } catch (e) {
      console.error('[SSE] Parse error:', e)
    }
  }

  async function connect() {
    if (!mounted) return
    if (abortController) abortController.abort()
    abortController = new AbortController()
    connectionError.value = null

    try {
      const res = await fetch('/api/stream', {
        signal: abortController.signal,
        headers: { 'Accept': 'text/event-stream' }
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      state.connected = true
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (mounted) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          if (!part.trim() || part.trim() === ':') continue
          const eventMatch = part.match(/^event: (.+)$/m)
          const dataMatch = part.match(/^data: (.+)$/m)
          if (eventMatch && dataMatch) {
            handleEvent(eventMatch[1], dataMatch[1])
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[fetch] SSE error:', e.message)
      }
    }

    state.connected = false

    // Reconnect after 2s
    if (mounted) {
      pollTimer = setTimeout(connect, 2000)
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
        throw new Error(`Server error (${res.status})`)
      }
      return await res.json()
    } catch (e) {
      console.error('[cmd] Error:', e.message)
      return null
    }
  }

  async function submit(text, mode = 'broadcast', modelName = null) {
    await sendCommand('submit', { text, mode, modelName })
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
    const data = await sendCommand('resume', { sessionId: id })
    if (data) {
      await sendCommand('state')
      currentView.value = 'broadcast'
    }
    return data
  }

  function disconnect() {
    mounted = false
    if (abortController) abortController.abort()
    if (pollTimer) clearTimeout(pollTimer)
  }

  onMounted(() => {
    mounted = true
    connect()
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
    resumeSession,
    connect,
    disconnect
  }
}
