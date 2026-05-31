<script setup>
import { ref, computed, inject, onMounted } from 'vue'

const { state, currentView, sessions, submit, loadSessions, resumeSession } = inject('appState')
const t = inject('t')

const inputText = ref('')

const taskCards = computed(() => [
  {
    id: 'code',
    emoji: '&lt;/&gt;',
    title: t('writeCode'),
    items: [t('refactor'), t('newFeature'), t('debug')],
    prompt: t('promptCode'),
  },
  {
    id: 'write',
    emoji: '&#9998;',
    title: t('writeContent'),
    items: [t('blogPost'), t('documentation'), t('proposal')],
    prompt: t('promptWrite'),
  },
  {
    id: 'analyze',
    emoji: '&#9881;',
    title: t('analyze'),
    items: [t('codeReview'), t('architecture'), t('performance')],
    prompt: t('promptAnalyze'),
  },
  {
    id: 'plan',
    emoji: '&#9878;',
    title: t('plan'),
    items: [t('architecture'), t('migration'), t('roadmap')],
    prompt: t('promptPlan'),
  }
])

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
      <p class="home-subtitle">{{ t('heroSubtitle') }}</p>
    </header>

    <section class="home-grid">
      <div
        v-for="card in taskCards"
        :key="card.id"
        class="home-card glass"
        @click="onCardClick(card)"
      >
        <div class="card-emoji" v-html="card.emoji"></div>
        <h3 class="card-title">{{ card.title }}</h3>
        <ul class="card-tags">
          <li v-for="item in card.items" :key="item">{{ item }}</li>
        </ul>
      </div>
    </section>

    <section class="home-input-area">
      <div class="input-wrapper glass">
        <textarea
          v-model="inputText"
          class="home-textarea"
          rows="3"
          :placeholder="t('askAllModels')"
          @keydown.enter.exact.prevent="handleSubmit"
        ></textarea>
        <button
          class="home-submit"
          :disabled="!inputText.trim()"
          @click="handleSubmit"
        >
          {{ t('sendToAll') }}
        </button>
      </div>
    </section>

    <section v-if="sessions.length > 0" class="home-sessions">
      <h2 class="section-heading">{{ t('previousSessions') }}</h2>
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
  width: 100%;
  padding: 48px 32px 80px;
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
  color: var(--text);
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.home-subtitle {
  font-size: 0.95rem;
  color: var(--text-dim);
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 32px;
}

.home-card {
  padding: 18px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.home-card:hover {
  border-color: var(--border);
  background: var(--surface-hover);
}

.card-emoji {
  font-size: 1.3rem;
  margin-bottom: 8px;
  color: var(--text-dim);
}

.card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
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
  color: var(--text-dim);
  background: var(--card);
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
  padding: 14px;
}

.home-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
  resize: vertical;
  min-height: 72px;
  line-height: 1.6;
  outline: none;
  border-radius: 8px;
}

.home-textarea::placeholder {
  color: var(--text-dim);
}

.home-submit {
  align-self: flex-end;
  padding: 10px 24px;
  background: var(--primary);
  border: none;
  color: #fff;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.home-submit:hover:not(:disabled) {
  background: var(--primary-hover);
}

.home-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.home-sessions {
  border-top: 1px solid var(--card);
  padding-top: 28px;
}

.section-heading {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
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
  background: var(--surface);
  border: 1px solid var(--card);
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
  border-color: var(--border);
}

.sess-id {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.8rem;
  color: var(--primary);
}

.sess-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-dim);
}

@media (max-width: 768px) {
  .home { padding: 24px 16px 60px; }
  .home-grid { grid-template-columns: 1fr; }
  .home-title { font-size: 1.5rem; }
}
</style>
