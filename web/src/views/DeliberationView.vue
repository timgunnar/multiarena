<script setup>
import { ref, computed, inject } from 'vue'

const { state, currentView, submit } = inject('appState')
const t = inject('t')
const taskInput = ref('')

function startDeliberation() {
  if (!taskInput.value.trim()) return
  submit(taskInput.value.trim(), 'deliberation')
  taskInput.value = ''
}

const deliberation = computed(() => state.deliberation)

const rounds = computed(() => {
  if (!deliberation.value) return []
  return deliberation.value.rounds || []
})

const thinkText = computed(() => {
  if (!deliberation.value) return ''
  return deliberation.value.thinkText || deliberation.value.thinking || ''
})

const documentPreview = computed(() => {
  if (!deliberation.value) return ''
  const doc = deliberation.value.document
  if (!doc) return ''
  return typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2)
})

const progressPct = computed(() => {
  if (!deliberation.value) return 0
  return Math.round((deliberation.value.progress || 0) * 100)
})

const phase = computed(() => {
  if (!deliberation.value) return 'idle'
  return deliberation.value.phase || 'thinking'
})

function backToBroadcast() {
  currentView.value = 'broadcast'
}
</script>

<template>
  <div class="delib">
    <header class="delib-top">
      <button class="delib-back" @click="backToBroadcast">{{ t('back') }}</button>
      <span class="delib-title">{{ t('deliberation') }}</span>
      <div v-if="deliberation" class="delib-phase-badge" :class="phase">{{ phase }}</div>
    </header>

    <div v-if="!deliberation" class="delib-start">
      <p class="delib-start-title">{{ t('noDeliberation') }}</p>
      <p class="delib-start-hint">{{ t('deliberationHint') }}</p>
      <div class="delib-input-row">
        <textarea
          v-model="taskInput"
          class="delib-textarea"
          :placeholder="t('deliberationPlaceholder')"
          rows="3"
        ></textarea>
        <button
          class="delib-submit-btn"
          @click="startDeliberation"
          :disabled="!taskInput.trim()"
        >{{ t('startTeam') }}</button>
      </div>
    </div>

    <div v-else class="delib-content">
      <!-- Progress -->
      <div class="delib-progress-bar">
        <div class="delib-progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>
      <div class="delib-progress-label">{{ t('percentComplete', { pct: progressPct }) }}</div>

      <!-- Think text -->
      <section v-if="thinkText" class="delib-section">
        <h3 class="delib-section-hdr">
          <span class="delib-section-icon">&#9881;</span>
          {{ t('thinking') }}
        </h3>
        <pre class="delib-think">{{ thinkText }}</pre>
      </section>

      <!-- Rounds -->
      <section v-if="rounds.length > 0" class="delib-section">
        <h3 class="delib-section-hdr">
          <span class="delib-section-icon">&#9744;</span>
          {{ t('roundsLabel', { n: rounds.length }) }}
        </h3>
        <div class="delib-rounds">
          <div
            v-for="(r, idx) in rounds"
            :key="idx"
            class="delib-round"
          >
            <div class="delib-round-hdr">
              <span class="delib-round-num">{{ t('roundN', { n: idx + 1 }) }}</span>
              <span class="delib-round-type">{{ r.type || 'compare' }}</span>
            </div>
            <div v-if="r.summary" class="delib-round-summary">{{ r.summary }}</div>
            <div v-if="r.decision" class="delib-round-decision">
              <strong>{{ t('decision') }}:</strong> {{ r.decision }}
            </div>
          </div>
        </div>
      </section>

      <!-- Document preview -->
      <section v-if="documentPreview" class="delib-section">
        <h3 class="delib-section-hdr">
          <span class="delib-section-icon">&#9776;</span>
          {{ t('documentPreview') }}
        </h3>
        <pre class="delib-doc">{{ documentPreview }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.delib {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  overflow-y: auto;
}

.delib-top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--card);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 5;
}

.delib-back {
  background: none;
  border: none;
  color: #58a6ff;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 4px 8px;
  border-radius: 4px;
}

.delib-back:hover {
  background: #1f6feb22;
}

.delib-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  flex: 1;
}

.delib-phase-badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: 4px;
  font-weight: 600;
  background: var(--card);
  color: var(--text-dim);
}

.delib-phase-badge.thinking {
  background: #9a670022;
  color: #d29922;
}

.delib-phase-badge.writing {
  background: #1f6feb22;
  color: #58a6ff;
}

.delib-phase-badge.reviewing {
  background: #7c3aed22;
  color: #a371f7;
}

.delib-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: var(--text-dim);
}

.delib-empty p {
  margin-bottom: 8px;
}

.delib-empty-hint {
  font-size: 0.85rem;
  color: #484f58;
  max-width: 400px;
}

.delib-content {
  padding: 20px 24px;
}

.delib-progress-bar {
  height: 4px;
  background: var(--card);
  border-radius: 2px;
  margin-bottom: 6px;
  overflow: hidden;
}

.delib-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.delib-progress-label {
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-bottom: 24px;
}

.delib-section {
  margin-bottom: 28px;
}

.delib-section-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--card);
}

.delib-section-icon {
  font-size: 0.9rem;
}

.delib-think {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--text-dim);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--surface);
  border: 1px solid var(--card);
  border-radius: 8px;
  padding: 14px;
  margin: 0;
}

.delib-rounds {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.delib-round {
  background: var(--surface);
  border: 1px solid var(--card);
  border-radius: 8px;
  padding: 14px;
}

.delib-round-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.delib-round-num {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text);
}

.delib-round-type {
  font-size: 0.7rem;
  text-transform: uppercase;
  background: var(--card);
  color: var(--text-dim);
  padding: 2px 8px;
  border-radius: 4px;
}

.delib-round-summary {
  font-size: 0.82rem;
  color: var(--text-dim);
  line-height: 1.5;
}

.delib-round-decision {
  margin-top: 8px;
  font-size: 0.82rem;
  color: #3fb950;
}

.delib-doc {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--surface);
  border: 1px solid var(--card);
  border-radius: 8px;
  padding: 14px;
  margin: 0;
  max-height: 500px;
  overflow-y: auto;
}

.delib-start { text-align: center; padding: 48px 24px; }
.delib-start-title { font-size: 20px; margin-bottom: 8px; color: var(--text); }
.delib-start-hint { color: var(--text-dim); margin-bottom: 32px; font-size: 0.9rem; }
.delib-input-row { display: flex; gap: 12px; align-items: flex-start; max-width: 640px; margin: 0 auto; }
.delib-textarea { flex: 1; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 15px; resize: vertical; min-height: 80px; font-family: inherit; }
.delib-submit-btn { background: #7c3aed; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; cursor: pointer; white-space: nowrap; }
.delib-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
