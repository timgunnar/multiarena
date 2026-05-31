<script setup>
import { inject, ref } from 'vue'

const { connectionError } = inject('appState')
const t = inject('t')

const dismissed = ref(false)

function onDismiss() {
  dismissed.value = true
  setTimeout(() => { dismissed.value = false }, 30000)
}
</script>

<template>
  <div
    v-if="connectionError && !dismissed"
    class="conn-banner"
  >
    <span class="conn-msg">{{ connectionError }}</span>
    <div class="conn-actions">
      <button class="conn-btn dismiss" @click="onDismiss">{{ t('dismiss') }}</button>
    </div>
  </div>
</template>

<style scoped>
.conn-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #da363322;
  border-bottom: 1px solid #da363366;
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}

.conn-msg {
  font-size: 0.8rem;
  color: #f85149;
  flex: 1;
  min-width: 0;
}

.conn-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.conn-btn {
  font-size: 0.72rem;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid;
  font-weight: 600;
  transition: opacity 0.15s;
}

.conn-btn:hover {
  opacity: 0.85;
}

.conn-btn.dismiss {
  background: var(--card);
  border-color: var(--border);
  color: var(--text-dim);
}
</style>
