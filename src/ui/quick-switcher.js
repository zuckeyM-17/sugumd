// Ctrl/Cmd + K で開く、ドキュメント名・本文から探して移動するダイアログ。
import { renderSnippet } from './snippet.js'

let active = null

export function isQuickSwitcherOpen() {
  return active != null
}

/**
 * @param search   (query) => [{ id, title, snippet }]
 * @param onPick   (id) => void
 * @param onCreate (title) => void  見つからないとき「この名前で新規作成」
 */
export function openQuickSwitcher({ search, onPick, onCreate }) {
  if (active) return active.input.focus()
  const backdrop = document.createElement('div')
  backdrop.className = 'switcher-backdrop'
  const dialog = document.createElement('div')
  dialog.className = 'switcher'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-label', 'Open document')
  const input = document.createElement('input')
  input.className = 'switcher-input'
  input.placeholder = 'Search documents by title or content…'
  input.setAttribute('aria-label', 'Search documents')
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-expanded', 'true')
  const list = document.createElement('div')
  list.className = 'switcher-list'
  list.setAttribute('role', 'listbox')
  list.id = 'switcher-list'
  input.setAttribute('aria-controls', list.id)
  const footer = document.createElement('div')
  footer.className = 'switcher-footer'
  footer.textContent = '↑↓ to select · Enter to open · Esc to close'
  dialog.append(input, list, footer)
  backdrop.append(dialog)
  document.body.append(backdrop)

  let items = []
  let selected = 0

  function draw() {
    const query = input.value.trim()
    const results = search(query).slice(0, 30)
    items = results.map((r) => ({ kind: 'doc', ...r }))
    if (query) items.push({ kind: 'create', title: query })
    selected = Math.min(selected, items.length - 1)
    list.innerHTML = ''
    items.forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'switcher-item' + (i === selected ? ' is-selected' : '')
      row.id = `switcher-item-${i}`
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', String(i === selected))
      const title = document.createElement('div')
      title.className = 'switcher-title'
      title.textContent = item.kind === 'create' ? `+ Create “${item.title}”` : item.title
      row.append(title)
      if (item.snippet) row.append(renderSnippet(item.snippet, 'switcher-snippet'))
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        choose(i)
      })
      row.addEventListener('mousemove', () => {
        if (selected !== i) {
          selected = i
          highlight()
        }
      })
      list.append(row)
    })
    highlight()
  }

  function highlight() {
    list.querySelectorAll('.switcher-item').forEach((row, i) => {
      row.classList.toggle('is-selected', i === selected)
      row.setAttribute('aria-selected', String(i === selected))
    })
    input.setAttribute('aria-activedescendant', `switcher-item-${selected}`)
    list.children[selected]?.scrollIntoView({ block: 'nearest' })
  }

  function choose(i) {
    const item = items[i]
    if (!item) return
    close()
    if (item.kind === 'create') onCreate(item.title)
    else onPick(item.id)
  }

  function close() {
    backdrop.remove()
    active = null
  }

  input.addEventListener('input', () => {
    selected = 0
    draw()
  })
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return // 日本語変換中の Enter は確定に使う
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!items.length) return
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(selected)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close()
  })

  active = { input, close }
  draw()
  input.focus()
}
