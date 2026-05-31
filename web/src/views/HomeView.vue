<script setup>
import { ref, inject, onMounted } from 'vue'

const { state, currentView, sessions, submit, loadSessions, resumeSession } = inject('appState')

const inputText = ref('')

const taskCards = [
  {
    id: 'code',
    emoji: '&lt;/&gt;',
    title: 'Write Code',
    items: ['Refactor', 'New Feature', 'Debug'],
    prompt: 'Implement a rate-limited API client in TypeScript with exponential backoff retry logic.'
  },
  {
    id: 'write',
    emoji: '&#9998;',
    title: 'Write Content',
    items: ['Blog Post', 'Documentation', 'Proposal'],
    prompt: 'Write a technical blog post about the benefits of multi-model AI orchestration for software development.'
  },
  {
    id: 'analyze',
    emoji: '&#9881;',
    title: 'Analyze',
    items: ['Code Review', 'Architecture', 'Performance'],
    prompt: 'Review this code for security vulnerabilities, race conditions, and memory leaks. Suggest concrete fixes.'
  },
  {
    id: 'plan',
    emoji: '&#9878;',
    title: 'Plan',
    items: ['Architecture', 'Migration', 'Roadmap'],
    prompt: 'Design a system architecture for a real-time collaborative text editor with offline support.'
  }
]

function onCardClick(card) {
  inputText.value = card.prompt
}

function handleSubmit() {
  const text = inputText.value.trim()
  if (!text) return
  submit(text)
}

function onResume(id) {
  resumeSession(id)
}

onMounted(() => {
  loadSessions()
})
</script>

<template>
  <div class="home">
    <header class="home-hero">
      <h1 class="home-title">multiarena</h1>
      <p class="home-subtitle">Compare multiple AI models side-by-side. Ask once, see all answers.</p>
    </header>

    <section class="home-grid">
      <div
        v-for="card in taskCards"
        :key="card.id"
        class="home-card"
        @click="onCardClick(card)"
      >
        <div class="card-emoji" v-html="card.emoji"></div>
        <h3 class="card-title">{{ card.title }}</h3>
        <ul class="card-tags">
          <li v-for="t in card.items" :key="t">{{ t }}</li>
        </ul>
      </div>
    </section>

    <section class="home-input-area">
      <div class="input-wrapper">
        <textarea
          v-model="inputText"
          class="home-textarea"
          rows="3"
          placeholder="Ask all models at once... e.g. Write a function that detects palindrome strings in O(n) time"
          @keydown.enter.exact.prevent="handleSubmit"
        ></textarea>
        <button
          class="home-submit"
          :disabled="!inputText.trim()"
          @click="handleSubmit"
        >
          Send to All Models &rarr;
        </button>
      </div>
      <p class="mode-hint" v-if="state.models.length > 0">
        {{ state.mode === 'broadcast' ? 'Broadcast mode — all models receive every message' : 'Directed mode — messages go to selected model only' }}
      </p>
    </section>

    <section v-if="sessions.length > 0" class="home-sessions">
      <h2 class="section-heading">Previous Sessions</h2>
      <div class="session-cards">
        <button
          v-for="s in sessions"
          :key="s.id"
          class="session-card"
          @click="onResume(s.id)"
        >
          <div class="sess-id">{{ s.id.slice(0, 12) }}...</div>
          <div class="sess-meta">
            <span class="sess-models">{{ (s.models || []).map(m => m.name).join(', ') || 'Unknown' }}</span>
            <span v-if="s.timestamp" class="sess-date">{{ new Date(s.timestamp).toLocaleDateString() }}</span>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px 80px;
  overflow-y: auto;
  height: 100%;
}

.home-hero {
  text-align: center;
  margin-bottom: 40px;
}

.home-title {
  font-size: 2rem;
  font-weight: 800;
  color: #f0f6fc;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.home-subtitle {
  font-size: 0.95rem;
  color: #8b949e;
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 32px;
}

.home-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 12px;
  padding: 18px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.home-card:hover {
  border-color: #30363d;
  background: #1c2128;
}

.card-emoji {
  font-size: 1.3rem;
  margin-bottom: 8px;
  color: #8b949e;
}

.card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #c9d1d9;
  margin-bottom: 10px;
}

.card-tags {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
}

.card-tags li {
  font-size: 0.72rem;
  color: #484f58;
  background: #21262d;
  padding: 2px 10px;
  border-radius: 12px;
}

.home-input-area {
  margin-bottom: 36px;
}

.input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 12px;
  padding: 14px;
}

.home-textarea {
  width: 100%;
  padding: 10px 0;
  border: none;
  background: transparent;
  color: #c9d1d9;
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  min-height: 72px;
  line-height: 1.6;
  outline: none;
}

.home-textarea::placeholder {
  color: #484f58;
}

.home-submit {
  align-self: flex-end;
  padding: 8px 20px;
  background: #238636;
  border: 1px solid #2ea043;
  color: #fff;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.home-submit:hover:not(:disabled) {
  background: #2ea043;
}

.home-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mode-hint {
  text-align: center;
  font-size: 0.75rem;
  color: #484f58;
  margin-top: 12px;
}

.home-sessions {
  border-top: 1px solid #21262d;
  padding-top: 28px;
}

.section-heading {
  font-size: 0.95rem;
  font-weight: 600;
  color: #c9d1d9;
  margin-bottom: 14px;
}

.session-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  transition: border-color 0.15s;
}

.session-card:hover {
  border-color: #30363d;
}

.sess-id {
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 0.8rem;
  color: #58a6ff;
}

.sess-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #484f58;
}

@media (max-width: 520px) {
  .home-grid {
    grid-template-columns: 1fr;
  }
  .home {
    padding: 32px 16px 60px;
  }
  .home-title {
    font-size: 1.5rem;
  }
}
</style>
