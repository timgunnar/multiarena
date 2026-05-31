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
const models = computed(() => state.models || [])

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
  const d = deliberation.value
  if (d.totalRounds && d.round) return Math.round((d.round / d.totalRounds) * 100)
  return 0
})

const phase = computed(() => {
  if (!deliberation.value) return 'idle'
  return deliberation.value.phase || 'thinking'
})

</script>

<template>
  <div class="delib">
    <header class="view-header glass">
      <span class="view-title">{{ t('deliberation') }}</span>
      <div v-if="deliberation" class="view-badge" :class="phase">{{ phase }}</div>
    </header>

    <!-- Empty state: no models -->
    <div v-if="!deliberation && models.length === 0" class="delib-empty glass">
      <p class="delib-empty-title">{{ t('noModelsConfigured') }}</p>
      <p class="delib-empty-hint">{{ t('noModelsDeliberationHint') }}</p>
    </div>

    <div v-else-if="!deliberation" class="delib-start glass">
      <p class="delib-start-title">{{ t('noDeliberation') }}</p>
      <p class="delib-start-hint">{{ t('deliberationHint') }}</p>
      <div class="delib-input-row">
        <textarea
          v-model="taskInput"
          class="delib-textarea"
          :placeholder="t('deliberationPlaceholder')"
          rows="3"
          @keydown.enter.exact.prevent="startDeliberation"
        ></textarea>
        <button
          class="delib-submit-btn"
          @click="startDeliberation"
          :disabled="!taskInput.trim()"
        >{{ t('startTeam') }}</button>
      </div>
    </div>

    <div v-else class="delib-content glass">
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

      <!-- Follow-up edit after completion -->
      <div v-if="phase === 'complete' || phase === 'done'" class="delib-followup">
        <textarea
          v-model="taskInput"
          class="delib-textarea"
          :placeholder="t('followUp')"
          rows="2"
          @keydown.enter.exact.prevent="startDeliberation"
        ></textarea>
        <button
          class="delib-submit-btn"
          @click="startDeliberation"
          :disabled="!taskInput.trim()"
        >{{ t('continueEdit') }}</button>
      </div>
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

.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  flex-shrink: 0;
}
.view-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
}
.view-badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: 4px;
  font-weight: 600;
  background: var(--card);
  color: var(--text-dim);
}
.view-badge.thinking { background: var(--warning-alpha); color: var(--warning); }
.view-badge.writing { background: var(--primary-alpha); color: var(--primary); }
.view-badge.reviewing { background: var(--primary-alpha); color: var(--primary-hover); }
.view-badge.complete { background: var(--accent-alpha); color: var(--accent); }

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

.delib-empty-title {
  font-size: 1rem;
  color: var(--text);
  margin-bottom: 8px;
}

.delib-empty-hint {
  font-size: 0.85rem;
  color: var(--text-dim);
  max-width: 400px;
}

.delib-content {
  padding: 20px 24px;
  flex: 1;
  overflow-y: auto;
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
  background: linear-gradient(90deg, var(--primary), var(--primary-hover));
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
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
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
  color: var(--accent);
}

.delib-doc {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
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

.delib-start { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; padding: 48px 24px; }
.delib-start-title { font-size: 20px; margin-bottom: 8px; color: var(--text); }
.delib-start-hint { color: var(--text-dim); margin-bottom: 32px; font-size: 0.9rem; }
.delib-input-row { display: flex; gap: 12px; align-items: flex-start; max-width: 100%; }
@media (max-width: 640px) {
  .delib-input-row { flex-direction: column; }
  .delib-submit-btn { width: 100%; }
  .delib-start { padding: 24px 16px; }
}
.delib-textarea { flex: 1; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 15px; resize: vertical; min-height: 80px; font-family: inherit; }
.delib-submit-btn { background: var(--primary); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.delib-submit-btn:hover:not(:disabled) { background: var(--primary-hover); }
.delib-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.delib-followup { display: flex; gap: 12px; align-items: flex-start; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }
</style>
