import { reactive, ref, onMounted, onUnmounted } from 'vue'

export function useWebSocket() {
  const state = reactive({
    sessionId: '',
    mode: 'broadcast',
    models: [],
    deliberation: null,
    permissionPrompt: null,
    connected: false
  })

  const currentView = ref('home')
  const sessions = ref([])
  const connectionError = ref(null)
  let eventSource = null
  let reconnectTimer = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 10
  let mounted = true

  function findModel(name) {
    return state.models.find(m => m.name === name)
  }

  function ensureModel(name) {
    let model = findModel(name)
    if (!model) {
      const entry = {
        name,
        buffer: '',
        isStreaming: false,
        usage: null,
        muted: false,
        messages: []
      }
      state.models.push(entry)
      return entry
    }
    return model
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

          currentView.value = s.sessionId ? 'broadcast' : 'home'
          break
        }

        case 'stream': {
          const model = ensureModel(payload.modelName)
          if (payload.text) {
            model.buffer += payload.text
          }
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
            if (payload.usage) {
              model.usage = payload.usage
            }
            model.messages.push({
              role: 'assistant',
              content: model.buffer,
              usage: payload.usage || null
            })
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
          console.error('[SSE] Server error:', payload.message)
          connectionError.value = payload.message
          break
        }

        case 'done': {
          state.models.forEach(m => { m.isStreaming = false })
          state.deliberation = null
          state.permissionPrompt = null
          break
        }

        default:
          console.warn('[SSE] Unknown event type:', eventType, payload)
      }
    } catch (e) {
      console.error('[SSE] Failed to parse event data:', e, data)
    }
  }

  function connect() {
    if (!mounted) return
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }

    connectionError.value = null
    state.connected = false

    const sourceUrl = '/api/stream'
    const es = new EventSource(sourceUrl)
    eventSource = es

    es.onopen = () => {
      state.connected = true
      reconnectAttempts = 0
      connectionError.value = null
    }

    const addListener = (name) => {
      es.addEventListener(name, (e) => {
        handleEvent(name, e.data)
      })
    }

    addListener('state')
    addListener('stream')
    addListener('stream_end')
    addListener('deliberation')
    addListener('permission_required')
    addListener('error')
    addListener('done')

    es.onerror = () => {
      state.connected = false
      es.close()
      eventSource = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (!mounted) return
    if (reconnectTimer) return
    if (reconnectAttempts >= maxReconnectAttempts) {
      connectionError.value = 'Connection lost. Maximum reconnect attempts reached.'
      return
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
    reconnectAttempts++
    connectionError.value = `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${reconnectAttempts}/${maxReconnectAttempts})`

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  async function sendCommand(type, payload = {}) {
    try {
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...payload })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Server error (${res.status}): ${text}`)
      }
      return await res.json().catch(() => ({}))
    } catch (e) {
      console.error('[CMD] Failed:', e)
      connectionError.value = e.message
      throw e
    }
  }

  async function submit(text) {
    await sendCommand('submit', { text })
    currentView.value = 'broadcast'
  }

  async function respondPermission(decision) {
    if (!state.permissionPrompt) return
    const requestId = state.permissionPrompt.requestId
    state.permissionPrompt = null
    await sendCommand('permission', { decision, requestId })
  }

  async function loadSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) {
        sessions.value = await res.json()
      }
    } catch (e) {
      console.error('[Sessions] Failed to load:', e)
    }
  }

  async function resumeSession(id) {
    await sendCommand('resume', { sessionId: id })
    currentView.value = 'broadcast'
  }

  function disconnect() {
    mounted = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    state.connected = false
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

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
