/**
 * WebSocket communication layer — mirrors CLI's direct function-call pattern.
 *
 * Single persistent WebSocket connection (ws://127.0.0.1:3000/ws).
 * All commands flow through WS: submit, permission, mute, reset, mode, save, resume.
 *
 * Features:
 * - Real-time streaming — no polling
 * - Automatic reconnection with exponential backoff (1s, 2s, 4s, max 30s)
 * - __INITIAL_STATE__ injection as instant fallback
 * - Connection status tracking
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue'

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

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

  // ── State update ──────────────────────────────────────────────

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

      case 'deliberation':
        // Deliberation progress event — replaces current state
        state.deliberation = msg.event
        break

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
      // Code 1000 is normal closure — don't reconnect
      if (mounted && event.code !== 1000) {
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      // onclose will fire next
    }
  }

  function disconnect() {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    reconnectAttempt = 0
    if (ws) {
      ws.close(1000)
      ws = null
    }
    state.connected = false
  }

  function scheduleReconnect() {
    if (!mounted) return
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    reconnectAttempt++
    connectionError.value = `Connection lost. Reconnecting in ${delay / 1000}s...`

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
    ws.send(JSON.stringify(msg))
    return true
  }

  function submit(text, mode = 'broadcast', modelName = null) {
    send({ type: 'submit', text, mode, modelName })
  }

  function respondPermission(decision) {
    send({ type: 'permission', decision })
    state.permissionPrompt = null
  }

  async function loadSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) {
        sessions.value = await res.json()
      }
    } catch (err) {
      // Server may not be running yet — suppress
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
