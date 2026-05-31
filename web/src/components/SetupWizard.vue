<script setup>
import { ref, computed, inject } from 'vue'

const emit = defineEmits(['complete', 'skip'])

const t = inject('t')

const appState = inject('appState')
const step = ref(0)

// Load models from server state, or start empty
const serverModels = window.__INITIAL_STATE__?.models || appState?.state?.models || []
const models = ref(
  serverModels.length > 0
    ? serverModels.map(m => ({ name: m.name, provider: m.provider || 'anthropic', nickname: m.name, api_key: '', enabled: true }))
    : [] // Empty — user needs to add models
)

const steps = computed(() => [
  { title: t('welcomeStep0Title'), description: t('welcomeStep0Desc') },
  { title: t('welcomeStep1Title'), description: t('welcomeStep1Desc') },
  { title: t('welcomeStep2Title'), description: t('welcomeStep2Desc') }
])

const enabledCount = computed(() => models.value.filter(m => m.enabled).length)

function toggleModel(idx) {
  models.value[idx].enabled = !models.value[idx].enabled
}

function nextStep() {
  if (step.value < steps.value.length - 1) {
    step.value++
  } else {
    const enabled = models.value.filter(m => m.enabled)
    const config = { models: enabled }
    // Save to localStorage for UI persistence
    localStorage.setItem('multiarena-config', JSON.stringify(config))
    localStorage.setItem('multiarena-setup-done', '1')
    // Also save to server (.multiarenarc) so CLI and future Web sessions share config
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }).then(() => {
      emit('complete')
    }).catch(() => {
      // Server might not be ready — still proceed with localStorage config
      emit('complete')
    })
  }
}

function prevStep() {
  if (step.value > 0) step.value--
}
</script>

<template>
  <div class="wizard-overlay">
    <div class="wizard-card">
      <div class="wiz-step-indicator">
        <span
          v-for="(s, i) in steps"
          :key="i"
          class="wiz-dot"
          :class="{ active: i === step, done: i < step }"
        ></span>
      </div>

      <h1 class="wiz-title">{{ steps[step].title }}</h1>
      <p class="wiz-desc">{{ steps[step].description }}</p>

      <div class="wiz-body">
        <div v-if="step === 0" class="wiz-welcome">
          <ul class="wiz-features">
            <li>{{ t('feature1') }}</li>
            <li>{{ t('feature2') }}</li>
            <li>{{ t('feature3') }}</li>
            <li>{{ t('feature4') }}</li>
          </ul>
        </div>

        <div v-else-if="step === 1" class="wiz-models">
          <div v-if="models.length === 0" class="wiz-empty-models">
            <p>{{ t('noModels') }}</p>
            <p class="wiz-hint">{{ t('addModelHint') }}</p>
          </div>
          <label
            v-for="(m, i) in models"
            :key="m.name || i"
            class="wiz-model-row"
          >
            <input type="checkbox" :checked="m.enabled" @change="toggleModel(i)" />
            <span class="wiz-provider-tag">{{ m.provider }}</span>
            <span class="wiz-model-name">{{ m.name }}</span>
          </label>
          <p v-if="models.length > 0" class="wiz-count">{{ t('selected', { n: enabledCount }) }}</p>
        </div>

        <div v-else class="wiz-ready">
          <p v-html="t('readyModels', { n: enabledCount })"></p>
          <p v-html="t('readyPrompt')"></p>
        </div>
      </div>

      <div class="wiz-footer">
        <button class="wiz-btn sec" @click="emit('skip')">{{ t('skip') }}</button>
        <div class="wiz-nav">
          <button v-if="step > 0" class="wiz-btn sec" @click="prevStep">{{ t('back') }}</button>
          <button class="wiz-btn pri" @click="nextStep">
            {{ step === steps.length - 1 ? t('start') : t('next') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-overlay {
  position: fixed; inset: 0;
  background: var(--bg)f2;
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  backdrop-filter: blur(6px);
}
.wizard-card {
  width: 480px; max-width: 92vw;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 32px 36px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
}
.wiz-step-indicator {
  display: flex; gap: 8px; margin-bottom: 20px;
}
.wiz-dot {
  flex: 1; height: 3px; border-radius: 2px; background: var(--card);
}
.wiz-dot.active { background: var(--primary); }
.wiz-dot.done { background: var(--accent); }
.wiz-title {
  font-size: 1.3rem; color: var(--text); margin-bottom: 6px;
}
.wiz-desc {
  font-size: 0.85rem; color: var(--text-dim); margin-bottom: 24px;
}
.wiz-features {
  list-style: none; display: flex; flex-direction: column; gap: 10px;
}
.wiz-features li {
  padding-left: 20px; position: relative; font-size: 0.88rem; color: var(--text-dim);
}
.wiz-features li::before {
  content: '\2713'; position: absolute; left: 0; color: var(--accent); font-weight: 700;
}
.wiz-models { display: flex; flex-direction: column; gap: 8px; }
.wiz-model-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; background: var(--bg);
  border: 1px solid var(--card); border-radius: 8px; cursor: pointer;
}
.wiz-model-row:hover { border-color: var(--border); }
.wiz-model-row input { accent-color: var(--accent); }
.wiz-provider-tag {
  font-size: 0.65rem; text-transform: uppercase; color: var(--text-dim);
  letter-spacing: 0.05em; min-width: 80px;
}
.wiz-model-name {
  font-size: 0.85rem; color: var(--text);
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}
.wiz-count { font-size: 0.78rem; color: var(--text-dim); text-align: center; margin-top: 8px; }
.wiz-ready p { font-size: 0.9rem; color: var(--text-dim); margin-bottom: 8px; }
.wiz-ready strong { color: var(--text); }
kbd {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 3px; padding: 1px 5px; font-size: 0.8rem;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}
.wiz-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--card);
}
.wiz-nav { display: flex; gap: 8px; }
.wiz-btn {
  padding: 8px 20px; border-radius: 6px; font-size: 0.85rem; cursor: pointer;
  border: 1px solid var(--border); transition: background 0.15s;
}
.wiz-btn.sec { background: var(--card); color: var(--text); }
.wiz-btn.sec:hover { background: var(--border); }
.wiz-btn.pri { background: var(--accent); border-color: var(--accent); color: #000; }
.wiz-btn.pri:hover { filter: brightness(1.1); }
</style>
