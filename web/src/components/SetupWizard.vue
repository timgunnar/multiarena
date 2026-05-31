<script setup>
import { ref, computed, inject } from 'vue'

const emit = defineEmits(['complete', 'skip'])

const { connect } = inject('appState')
const t = inject('t')

const step = ref(0)
const models = ref([
  { name: 'claude-sonnet-4-20250514', provider: 'Anthropic', enabled: true },
  { name: 'gpt-4o', provider: 'OpenAI', enabled: true },
  { name: 'gemini-2.5-pro', provider: 'Google', enabled: true }
])

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
    localStorage.setItem('multiarena-setup-done', '1')
    localStorage.setItem('multiarena-models', JSON.stringify(
      models.value.filter(m => m.enabled).map(m => ({ name: m.name, provider: m.provider }))
    ))
    connect()
    emit('complete')
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
          <label
            v-for="(m, i) in models"
            :key="m.name"
            class="wiz-model-row"
          >
            <input type="checkbox" :checked="m.enabled" @change="toggleModel(i)" />
            <span class="wiz-provider-tag">{{ m.provider }}</span>
            <span class="wiz-model-name">{{ m.name }}</span>
          </label>
          <p class="wiz-count">{{ t('selected', { n: enabledCount }) }}</p>
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
  background: #0d1117f2;
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  backdrop-filter: blur(6px);
}
.wizard-card {
  width: 480px; max-width: 92vw;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 14px;
  padding: 32px 36px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
}
.wiz-step-indicator {
  display: flex; gap: 8px; margin-bottom: 20px;
}
.wiz-dot {
  flex: 1; height: 3px; border-radius: 2px; background: #21262d;
}
.wiz-dot.active { background: #58a6ff; }
.wiz-dot.done { background: #3fb950; }
.wiz-title {
  font-size: 1.3rem; color: #f0f6fc; margin-bottom: 6px;
}
.wiz-desc {
  font-size: 0.85rem; color: #8b949e; margin-bottom: 24px;
}
.wiz-features {
  list-style: none; display: flex; flex-direction: column; gap: 10px;
}
.wiz-features li {
  padding-left: 20px; position: relative; font-size: 0.88rem; color: #8b949e;
}
.wiz-features li::before {
  content: '\2713'; position: absolute; left: 0; color: #3fb950; font-weight: 700;
}
.wiz-models { display: flex; flex-direction: column; gap: 8px; }
.wiz-model-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; background: #0d1117;
  border: 1px solid #21262d; border-radius: 8px; cursor: pointer;
}
.wiz-model-row:hover { border-color: #30363d; }
.wiz-model-row input { accent-color: #238636; }
.wiz-provider-tag {
  font-size: 0.65rem; text-transform: uppercase; color: #484f58;
  letter-spacing: 0.05em; min-width: 80px;
}
.wiz-model-name {
  font-size: 0.85rem; color: #c9d1d9;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}
.wiz-count { font-size: 0.78rem; color: #8b949e; text-align: center; margin-top: 8px; }
.wiz-ready p { font-size: 0.9rem; color: #8b949e; margin-bottom: 8px; }
.wiz-ready strong { color: #c9d1d9; }
kbd {
  background: #21262d; border: 1px solid #30363d;
  border-radius: 3px; padding: 1px 5px; font-size: 0.8rem;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}
.wiz-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 28px; padding-top: 20px; border-top: 1px solid #21262d;
}
.wiz-nav { display: flex; gap: 8px; }
.wiz-btn {
  padding: 8px 20px; border-radius: 6px; font-size: 0.85rem; cursor: pointer;
  border: 1px solid #30363d; transition: background 0.15s;
}
.wiz-btn.sec { background: #21262d; color: #c9d1d9; }
.wiz-btn.sec:hover { background: #30363d; }
.wiz-btn.pri { background: #238636; border-color: #2ea043; color: #fff; }
.wiz-btn.pri:hover { background: #2ea043; }
</style>
