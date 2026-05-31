import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import DeliberationView from '../views/DeliberationView.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockT = (key) => key

function createState(overrides = {}) {
  return reactive({
    models: [],
    deliberation: null,
    sessionId: 'test-session',
    ...overrides,
  })
}

function mountView(stateOverrides = {}) {
  const state = createState(stateOverrides)
  const submit = () => {}
  const wrapper = mount(DeliberationView, {
    global: {
      provide: {
        appState: { state, currentView: { value: 'deliberation' }, submit },
        t: mockT,
      },
    },
  })
  return { wrapper, state }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeliberationView rendering', () => {
  // Clean up between tests so mounts are isolated.
  let wrappers = []

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers = []
  })

  function mountAndTrack(stateOverrides) {
    const { wrapper, state } = mountView(stateOverrides)
    wrappers.push(wrapper)
    return { wrapper, state }
  }

  // -----------------------------------------------------------------------
  // 1. Round header shows model name and role
  // -----------------------------------------------------------------------
  describe('round header', () => {
    it('displays modelName and type in round header', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'thinking',
          rounds: [
            {
              round: 1,
              modelName: 'claude-sonnet',
              type: 'writer',
              think: 'I need to plan the document...',
            },
          ],
        },
      })

      const hdr = wrapper.find('.delib-round-hdr')
      expect(hdr.exists()).toBe(true)

      // Header left side includes modelName
      const numEl = hdr.find('.delib-round-num')
      expect(numEl.exists()).toBe(true)
      expect(numEl.text()).toContain('claude-sonnet')

      // Header right side shows type
      const typeEl = hdr.find('.delib-round-type')
      expect(typeEl.exists()).toBe(true)
      expect(typeEl.text()).toBe('writer')
    })

    it('renders multiple rounds with distinct headers', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'writing',
          rounds: [
            { round: 1, modelName: 'claude-sonnet', type: 'writer', think: 't1' },
            { round: 2, modelName: 'gpt-4o', type: 'reviewer', think: 't2' },
          ],
        },
      })

      const headers = wrapper.findAll('.delib-round-hdr')
      expect(headers).toHaveLength(2)

      const types = wrapper.findAll('.delib-round-type')
      expect(types).toHaveLength(2)
      expect(types[0].text()).toBe('writer')
      expect(types[1].text()).toBe('reviewer')
    })
  })

  // -----------------------------------------------------------------------
  // 2. Think text shown and scrollable
  // -----------------------------------------------------------------------
  describe('think text', () => {
    it('renders think content inside pre.delib-think', () => {
      const thinkContent = 'I should structure this as a three-act narrative...'
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'thinking',
          rounds: [
            {
              round: 1,
              modelName: 'claude-sonnet',
              type: 'writer',
              think: thinkContent,
            },
          ],
        },
      })

      const pre = wrapper.find('pre.delib-think')
      expect(pre.exists()).toBe(true)
      expect(pre.text()).toBe(thinkContent)
      expect(pre.element.tagName).toBe('PRE')
    })

    it('does not render think when round has no think text', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'thinking',
          rounds: [
            {
              round: 1,
              modelName: 'm',
              type: 'writer',
              think: '',
            },
          ],
        },
      })

      expect(wrapper.find('pre.delib-think').exists()).toBe(false)
    })

    it('delib-think pre element has correct class for scroll container styling', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'thinking',
          rounds: [
            {
              round: 1,
              modelName: 'claude-sonnet',
              type: 'writer',
              think: 'Long analysis text that should scroll...',
            },
          ],
        },
      })

      const pre = wrapper.find('pre.delib-think')
      expect(pre.exists()).toBe(true)
      expect(pre.classes()).toContain('delib-think')
      // The element must be a <pre> tag (as verified by tag selector above)
      expect(pre.element.tagName).toBe('PRE')
    })
  })

  // -----------------------------------------------------------------------
  // 3. Think text hidden after summary appears
  // -----------------------------------------------------------------------
  describe('think vs summary visibility', () => {
    it('hides think pre when summary is present', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'reviewing',
          rounds: [
            {
              round: 1,
              modelName: 'claude-sonnet',
              type: 'writer',
              think: 'I will rewrite the opening paragraph...',
              summary: 'Changed introduction; added 2 paragraphs',
            },
          ],
        },
      })

      // Think must NOT render when summary exists
      expect(wrapper.find('pre.delib-think').exists()).toBe(false)

      // Summary must render
      const summaryEl = wrapper.find('.delib-round-summary')
      expect(summaryEl.exists()).toBe(true)
      expect(summaryEl.text()).toBe('Changed introduction; added 2 paragraphs')
    })

    it('shows think when summary is null even if think text exists', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'thinking',
          rounds: [
            {
              round: 1,
              modelName: 'm',
              type: 'writer',
              think: 'thinking...',
              summary: null,
            },
          ],
        },
      })

      expect(wrapper.find('pre.delib-think').exists()).toBe(true)
      expect(wrapper.find('.delib-round-summary').exists()).toBe(false)
    })

    it('shows both think and summary independently across rounds', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'writing',
          rounds: [
            {
              round: 1,
              modelName: 'm1',
              type: 'writer',
              think: 'drafting...',
              summary: null,
            },
            {
              round: 2,
              modelName: 'm2',
              type: 'reviewer',
              think: 'evaluating...',
              summary: 'Approved with 2 minor edits',
            },
          ],
        },
      })

      const thinkPres = wrapper.findAll('pre.delib-think')
      expect(thinkPres).toHaveLength(1) // only round 1
      expect(thinkPres[0].text()).toBe('drafting...')

      const summaries = wrapper.findAll('.delib-round-summary')
      expect(summaries).toHaveLength(1) // only round 2
      expect(summaries[0].text()).toBe('Approved with 2 minor edits')
    })
  })

  // -----------------------------------------------------------------------
  // 4. Summary shows change count
  // -----------------------------------------------------------------------
  describe('summary change count', () => {
    it('renders summary text including change counts', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'reviewing',
          rounds: [
            {
              round: 1,
              modelName: 'reviewer-model',
              type: 'reviewer',
              summary: '3 files changed · +12 -5 lines · restructured section 2',
            },
          ],
        },
      })

      const summary = wrapper.find('.delib-round-summary')
      expect(summary.exists()).toBe(true)
      expect(summary.text()).toContain('3 files changed')
      expect(summary.text()).toContain('+12 -5 lines')
    })

    it('renders decision text when present alongside summary', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'reviewing',
          rounds: [
            {
              round: 1,
              modelName: 'm',
              type: 'reviewer',
              summary: '2 issues found',
              decision: 'request_changes',
            },
          ],
        },
      })

      const summary = wrapper.find('.delib-round-summary')
      expect(summary.exists()).toBe(true)

      const decision = wrapper.find('.delib-round-decision')
      expect(decision.exists()).toBe(true)
      expect(decision.text()).toBe('request_changes')
    })
  })

  // -----------------------------------------------------------------------
  // 5. "新对话" button rendered after completion
  // -----------------------------------------------------------------------
  describe('new conversation button', () => {
    it('renders new-conversation button when phase is complete', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'complete',
          rounds: [],
        },
      })

      const btn = wrapper.find('.delib-new-btn')
      expect(btn.exists()).toBe(true)
    })

    it('renders new-conversation button when phase is done', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'done',
          rounds: [],
        },
      })

      expect(wrapper.find('.delib-new-btn').exists()).toBe(true)
    })

    it('does NOT render new-conversation button when still thinking', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'thinking',
          rounds: [{ round: 1, modelName: 'm', type: 'writer', think: 't' }],
        },
      })

      expect(wrapper.find('.delib-new-btn').exists()).toBe(false)
    })

    it('does NOT render new-conversation button when writing', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'writing',
          rounds: [],
        },
      })

      expect(wrapper.find('.delib-new-btn').exists()).toBe(false)
    })

    it('does NOT render new-conversation button when reviewing', () => {
      const { wrapper } = mountAndTrack({
        deliberation: {
          phase: 'reviewing',
          rounds: [],
        },
      })

      expect(wrapper.find('.delib-new-btn').exists()).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 6. Phase badge shows correct label and variant
  // -----------------------------------------------------------------------
  describe('phase badge', () => {
    it('renders no badge when deliberation is null', () => {
      const { wrapper } = mountAndTrack({
        deliberation: null,
      })

      expect(wrapper.find('.view-badge').exists()).toBe(false)
    })

    it('shows phase text and class for thinking', () => {
      const { wrapper } = mountAndTrack({
        deliberation: { phase: 'thinking', rounds: [] },
      })

      const badge = wrapper.find('.view-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('thinking')
      expect(badge.text()).toBe('thinking')
    })

    it('shows phase text and class for writing', () => {
      const { wrapper } = mountAndTrack({
        deliberation: { phase: 'writing', rounds: [] },
      })

      const badge = wrapper.find('.view-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('writing')
      expect(badge.text()).toBe('writing')
    })

    it('shows phase text and class for reviewing', () => {
      const { wrapper } = mountAndTrack({
        deliberation: { phase: 'reviewing', rounds: [] },
      })

      const badge = wrapper.find('.view-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('reviewing')
      expect(badge.text()).toBe('reviewing')
    })

    it('shows phase text and class for complete', () => {
      const { wrapper } = mountAndTrack({
        deliberation: { phase: 'complete', rounds: [] },
      })

      const badge = wrapper.find('.view-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('complete')
      expect(badge.text()).toBe('complete')
    })

    it('defaults to "thinking" when phase is missing from deliberation', () => {
      const { wrapper } = mountAndTrack({
        deliberation: { rounds: [] }, // no phase property
      })

      const badge = wrapper.find('.view-badge')
      expect(badge.exists()).toBe(true)
      // The computed defaults to 'thinking' when phase is undefined/falsy
      expect(badge.classes()).toContain('thinking')
      expect(badge.text()).toBe('thinking')
    })
  })
})
