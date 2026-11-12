import { describe, expect, it, vi } from 'vitest'
import { THEME_KEY, loadThemePreference, resolveTheme, saveThemePreference, setupTheme } from '../src/theme.js'

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  }
}

function fakeMedia(matches) {
  const listeners = []
  return {
    matches,
    addEventListener: (_type, fn) => listeners.push(fn),
    set(value) {
      this.matches = value
      listeners.forEach((fn) => fn())
    },
  }
}

describe('テーマの判定', () => {
  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ])('設定 %s・システムがダーク %s → %s', (pref, sys, theme) => {
    expect(resolveTheme(pref, sys)).toBe(theme)
  })

  it('不正な保存値や読めないストレージは「システムに合わせる」', () => {
    expect(loadThemePreference(memoryStorage({ [THEME_KEY]: 'purple' }))).toBe('system')
    expect(loadThemePreference({ getItem: () => { throw new Error('blocked') } })).toBe('system')
  })

  it('「システムに合わせる」を選ぶと保存値を消す', () => {
    const storage = memoryStorage()
    saveThemePreference(storage, 'dark')
    expect(storage.getItem(THEME_KEY)).toBe('dark')
    saveThemePreference(storage, 'system')
    expect(storage.map.has(THEME_KEY)).toBe(false)
  })
})

describe('setupTheme', () => {
  it('システム設定の変化に追従し、手動指定中は追従しない', () => {
    const media = fakeMedia(false)
    window.matchMedia = vi.fn(() => media)
    const events = []
    window.addEventListener('sugumd:themechange', (e) => events.push(e.detail.theme))
    const theme = setupTheme({ storage: memoryStorage() })
    expect(document.documentElement.dataset.theme).toBe('light')

    media.set(true)
    expect(document.documentElement.dataset.theme).toBe('dark')

    theme.setPreference('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    media.set(false)
    media.set(true)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(events).toEqual(['light', 'dark', 'light']) // 初回適用・システム追従・手動指定
  })
})
