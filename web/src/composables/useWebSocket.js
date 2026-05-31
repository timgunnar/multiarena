/**
 * WebSocket communication layer — mirrors CLI's direct function-call pattern.
 *
 * Single persistent WebSocket connection (ws://127.0.0.1:3000/ws).
 * All commands flow through WS: submit, permission, mute, reset, mode, save, resume.
 *
 * Features:
 * - Real-time streaming — no polling
 * - Exponential backoff with max 10 reconnect attempts
 * - __INITIAL_STATE__ injection as instant fallback
 * - Connection status tracking
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue'

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000, 15000]

/**
 * Standalone session loader — usable without instantiating the full composable.
 * Exported so Sidebar and other components can call it directly without creating
 * a duplicate WebSocket connection.
 */
export async function fetchSessions() {
  try {
    const res = await fetch('/api/sessions')
    if (res.ok) {
      return await res.json()
    }
  } catch {
    // Server may not be running yet — suppress
  }
  return []
}

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

  let ws = null
  let reconnectAttempt = 0
  let reconnectTimer = null
  let mounted = true
  let intentionalClose = false

  // ── State update ──────────────────────────────────────────────

  function updateState(payload) {
    if (!payload) return
    state.connected = true
    connectionError.value = null
    state.sessionId = payload.sessionId || ''
    state.mode = payload.mode || 'broadcast'
    // Preserve deliberation if user is still viewing it and server sent null
    if (payload.deliberation || currentView.value !== 'deliberation') {
      state.deliberation = payload.deliberation || null
    }
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

  // ── Message handler ───────────────────────────────────────────

  function handleMessage(msg) {
    switch (msg.type) {
      case 'state':
        updateState(msg)
        break

      case 'stream': {
        // Live stream chunk for a model — append to buffer
        const model = state.models.find(m => m.name === msg.modelName)
        if (model) {
          model.buffer += msg.text
          model.isStreaming = true
        }
        break
      }

      case 'stream_end': {
        const m = state.models.find(mm => mm.name === msg.modelName)
        if (m) {
          m.isStreaming = false
          if (msg.usage) m.usage = msg.usage
        }
        break
      }

      case 'deliberation': {
        // Accumulate deliberation events into a rich state object
        const evt = msg.event || msg
        if (!state.deliberation) {
          state.deliberation = { thinkText: '', document: '', rounds: [], round: 0, totalRounds: 0, phase: '' }
        }
        const d = state.deliberation
        if (evt.round) d.round = evt.round
        if (evt.totalRounds) d.totalRounds = evt.totalRounds
        if (evt.modelName) d.modelName = evt.modelName
        if (evt.role) d.role = evt.role
        if (evt.type === 'think_text' && evt.content) d.thinkText += evt.content
        if (evt.type === 'text' && evt.content) d.document += evt.content
        if (evt.type === 'round_end') {
          d.document = evt.document || d.document
          d.rounds.push({
            round: evt.round,
            modelName: evt.modelName || '',
            role: evt.role || '',
            changeCount: evt.changeCount,
            changeSamples: evt.changeSamples,
            // UI-friendly aliases
            type: evt.role || evt.type || 'round',
            summary: evt.changeCount != null ? `${evt.changeCount} changes` : '',
            decision: evt.changeSamples?.length ? evt.changeSamples[0] : ''
          })
        }
        if (evt.type === 'done') d.document = evt.document || d.document
        // Map raw event types to user-friendly phase labels
        if (evt.type) {
          const phaseMap = {
            think_start: 'thinking',
            think_text: 'thinking',
            round_start: 'writing',
            text: 'writing',
            round_end: 'reviewing',
            done: 'complete'
          }
          d.phase = phaseMap[evt.type] || evt.type
        }
        break
      }

      case 'permission_required':
        state.permissionPrompt = {
          requestId: msg.requestId,
          toolName: msg.toolName,
          args: msg.args,
          modelName: msg.modelName,
        }
        break

      case 'done':
        // Turn/deliberation complete — server sends state next
        break

      case 'saved':
        // Session saved — refresh session list
        loadSessions()
        break

      case 'error':
        console.error('[WS] Server error:', msg.message)
        break

      default:
        if (import.meta.env.DEV) {
          console.log('[WS] Unknown message type:', msg.type, msg)
        }
    }
  }

  // ── Connection management ─────────────────────────────────────

  function connect() {
    if (!mounted) return
    connectionError.value = null

    // In dev mode (Vite on :5173), connect directly to server on :3000.
    // In production, page is served from :3000 so same-origin works.
    const wsUrl = `ws://127.0.0.1:3000/ws`

    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e)
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      reconnectAttempt = 0
      state.connected = true
      connectionError.value = null
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleMessage(msg)
      } catch (e) {
        console.error('[WS] Failed to parse message:', e)
      }
    }

    ws.onclose = (event) => {
      state.connected = false
      ws = null
      // Don't reconnect on intentional close or normal closure
      if (!mounted || intentionalClose || event.code === 1000) {
        return
      }
      scheduleReconnect()
    }

    ws.onerror = (event) => {
      // Log but don't crash — onclose will fire next and handle reconnection
      console.error('[WS] Connection error')
    }
  }

  function disconnect() {
    intentionalClose = true
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    reconnectAttempt = 0
    if (ws) {
      try {
        ws.close(1000)
      } catch {
        // Already closed
      }
      ws = null
    }
    state.connected = false
    connectionError.value = null
  }

  function scheduleReconnect() {
    if (!mounted) return

    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      // Stop reconnecting after max attempts — user must refresh
      connectionError.value = 'Connection lost — refresh page'
      state.connected = false
      return
    }

    const delay = RECONNECT_DELAYS[reconnectAttempt]
    reconnectAttempt++
    connectionError.value = `Connection lost. Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`

    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  // ── Commands ──────────────────────────────────────────────────

  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectionError.value = 'Not connected. Retrying...'
      return false
    }
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch (e) {
      console.error('[WS] Send failed:', e)
      connectionError.value = 'Send failed — connection may be lost'
      return false
    }
  }

  function submit(text, mode = 'broadcast', modelName = null) {
    send({ type: 'submit', text, mode, modelName })
  }

  function respondPermission(decision) {
    send({ type: 'permission', decision })
    state.permissionPrompt = null
  }

  async function loadSessions() {
    const data = await fetchSessions()
    if (data.length > 0) {
      sessions.value = data
    }
  }

  function resumeSession(id) {
    if (send({ type: 'resume', sessionId: id })) {
      currentView.value = 'broadcast'
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  onMounted(() => {
    mounted = true
    intentionalClose = false

    // Server injects initial state into HTML — load instantly (before WS connects)
    if (window.__INITIAL_STATE__) {
      try {
        updateState(window.__INITIAL_STATE__)
      } catch (err) {
        console.error('[WS] Failed to parse __INITIAL_STATE__:', err)
      }
      delete window.__INITIAL_STATE__
    }

    // Load sessions via HTTP (works even before WS connects)
    loadSessions()

    // Connect WebSocket
    connect()
  })

  onUnmounted(() => {
    mounted = false
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
  }
}
