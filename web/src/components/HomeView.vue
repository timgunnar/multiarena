<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['navigate'])

const userName = ref('用户')
const inputText = ref('')
const sessions = ref([])

const taskCards = [
  {
    id: 'copywriting',
    icon: '✍️',
    title: '写文案',
    items: ['品牌故事', '广告语', '产品介绍'],
    prompt: '帮我写一个精品咖啡烘焙商的品牌故事，用在官网 About 页面，突出产地直采和手工烘焙的匠人精神。'
  },
  {
    id: 'analysis',
    icon: '📊',
    title: '分析数据',
    items: ['用户增长', '销售趋势', '竞品对比'],
    prompt: '请分析以下用户增长数据，找出关键趋势和异常点，并给出优化建议。'
  },
  {
    id: 'brainstorm',
    icon: '💡',
    title: '出主意',
    items: ['产品起名', '营销活动', '定价策略'],
    prompt: '我们正在为一个新产品起名，目标用户是25-35岁的都市白领，产品主打健康和便捷。请给出10个候选名称并说明理由。'
  },
  {
    id: 'review',
    icon: '🔍',
    title: '审文档',
    items: ['技术方案', '合同条款', 'PRD 评审'],
    prompt: '请审阅以下技术方案文档，关注架构合理性、安全隐患和性能瓶颈，并给出改进建议。'
  }
]

function selectCard(card) {
  inputText.value = card.prompt
}

function handleSubmit() {
  const text = inputText.value.trim()
  if (!text) return
  emit('navigate', { view: 'broadcast', prompt: text })
}

onMounted(() => {
  const saved = localStorage.getItem('multiarena-user-name')
  if (saved) {
    userName.value = saved
  }
})
</script>

<template>
  <div class="home">
    <header class="greeting">
      <h1>下午好，{{ userName }} 👋</h1>
      <p class="subtitle">今天想做什么？选一个开始吧</p>
    </header>

    <section class="task-grid">
      <div
        v-for="card in taskCards"
        :key="card.id"
        class="task-card"
        @click="selectCard(card)"
      >
        <div class="card-icon">{{ card.icon }}</div>
        <h3 class="card-title">{{ card.title }}</h3>
        <ul class="card-items">
          <li v-for="item in card.items" :key="item">{{ item }}</li>
        </ul>
      </div>
    </section>

    <section class="input-section">
      <textarea
        v-model="inputText"
        class="prompt-input"
        rows="3"
        placeholder="帮我写一个精品咖啡烘焙商的品牌故事，用在官网 About 页面…"
      ></textarea>
      <button class="submit-btn" @click="handleSubmit" :disabled="!inputText.trim()">
        让 AI 团队开始 →
      </button>
    </section>

    <section class="recent-section">
      <h2 class="section-title">最近的工作</h2>
      <div v-if="sessions.length === 0" class="no-sessions">
        <p>还没有历史工作记录。</p>
        <p class="tip">在上方输入你想做的事情，启动你的 AI 团队，开始第一次协作。</p>
      </div>
      <div v-else class="sessions-list">
        <div v-for="s in sessions" :key="s.id" class="session-item">
          <span class="session-title">{{ s.title || '未命名会话' }}</span>
          <span class="session-date">{{ s.date }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.greeting {
  margin-bottom: 36px;
}

.greeting h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 15px;
  color: #6b7280;
  margin: 0;
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin-bottom: 32px;
}

.task-card {
  background: #fff;
  border-radius: 12px;
  padding: 18px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.15s;
  border: 1px solid transparent;
}

.task-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
  border-color: #e8e0f0;
}

.card-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 8px 0;
}

.card-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.card-items li {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 3px 10px;
  border-radius: 20px;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 36px;
}

.prompt-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  font-size: 14px;
  color: #1a1a2e;
  background: #fff;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.6;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.prompt-input:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

.prompt-input::placeholder {
  color: #9ca3af;
}

.submit-btn {
  align-self: flex-end;
  padding: 12px 28px;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.submit-btn:hover:not(:disabled) {
  background: #6d28d9;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recent-section {
  border-top: 1px solid #f0f0f3;
  padding-top: 28px;
}

.section-title {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 16px 0;
}

.no-sessions {
  text-align: center;
  padding: 32px 20px;
  color: #6b7280;
}

.no-sessions p {
  margin: 4px 0;
  font-size: 14px;
}

.tip {
  font-size: 13px !important;
  color: #9ca3af !important;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.session-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.session-title {
  font-size: 14px;
  color: #1a1a2e;
  font-weight: 500;
}

.session-date {
  font-size: 12px;
  color: #9ca3af;
}

@media (max-width: 520px) {
  .task-grid {
    grid-template-columns: 1fr;
  }

  .home {
    padding: 28px 16px 60px;
  }

  .greeting h1 {
    font-size: 24px;
  }
}
</style>
