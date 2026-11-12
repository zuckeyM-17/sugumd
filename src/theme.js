// 表示テーマ（システムに合わせる / ライト / ダーク）。
// 実際の配色は <html data-theme="light|dark"> で切り替える。初回描画前の設定は index.html のインラインスクリプトが行う。

export const THEME_KEY = 'sugumd:theme'
export const THEME_PREFERENCES = ['system', 'light', 'dark']
export const THEME_CHANGE_EVENT = 'sugumd:themechange'

export function loadThemePreference(storage) {
  try {
    const value = storage.getItem(THEME_KEY)
    return THEME_PREFERENCES.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function saveThemePreference(storage, preference) {
  try {
    if (preference === 'system') storage.removeItem(THEME_KEY)
    else storage.setItem(THEME_KEY, preference)
  } catch {
    // 保存できなくても、今開いている画面には反映される
  }
}

/** 設定とシステムの状態から、実際に使う配色を決める。 */
export function resolveTheme(preference, systemPrefersDark) {
  if (preference === 'light' || preference === 'dark') return preference
  return systemPrefersDark ? 'dark' : 'light'
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/**
 * テーマ管理を始める。システム設定の変化（OS のダークモード切替）にも追従する。
 * @returns { get preference, setPreference(pref) }
 */
export function setupTheme({ storage = window.localStorage, onChange } = {}) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  let preference = loadThemePreference(storage)

  function apply() {
    const theme = resolveTheme(preference, Boolean(media?.matches))
    const changed = document.documentElement.dataset.theme !== theme
    document.documentElement.dataset.theme = theme
    if (changed) window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }))
    onChange?.({ preference, theme })
  }

  media?.addEventListener?.('change', () => {
    if (preference === 'system') apply()
  })
  apply()

  return {
    get preference() {
      return preference
    },
    setPreference(next) {
      if (!THEME_PREFERENCES.includes(next)) return
      preference = next
      saveThemePreference(storage, next)
      apply()
    },
  }
}
