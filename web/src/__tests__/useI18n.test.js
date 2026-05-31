import { describe, it, expect } from 'vitest'
import { useI18n } from '../composables/useI18n.js'

describe('useI18n', () => {
  it('returns zh translations by default', () => {
    const { t } = useI18n()
    expect(t('home')).toBe('首页')
    expect(t('broadcast')).toBe('多视角问答')
    expect(t('startTeam')).toBe('让 AI 团队开始 →')
  })

  it('switches to en and back', () => {
    const { t, setLocale, locale } = useI18n()
    expect(t('home')).toBe('首页')

    setLocale('en')
    expect(locale.value).toBe('en')
    expect(t('home')).toBe('Home')
    expect(t('broadcast')).toBe('Broadcast')

    setLocale('zh')
    expect(t('home')).toBe('首页')
  })

  it('returns key when translation missing', () => {
    const { t } = useI18n()
    expect(t('nonexistent_key_xyz')).toBe('nonexistent_key_xyz')
  })

  it('setLocale changes the locale ref value', () => {
    const { setLocale, locale } = useI18n()
    setLocale('en')
    expect(locale.value).toBe('en')
    setLocale('zh')
    expect(locale.value).toBe('zh')
  })
})
