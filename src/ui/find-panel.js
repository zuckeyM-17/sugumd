// Ctrl/Cmd + F（検索）・Ctrl/Cmd + H（置換）で開く、エディター右上の検索パネル。
import { findKey, revealCurrentMatch } from '../extensions/find-replace.js'

export function setupFindPanel(editor, container) {
  const panel = document.createElement('div')
  panel.className = 'find-panel'
  panel.hidden = true
  panel.setAttribute('role', 'search')
  panel.innerHTML = `
    <div class="find-row">
      <input class="find-input" type="text" placeholder="Find" aria-label="Find in document" />
      <span class="find-count" aria-live="polite"></span>
      <button type="button" class="find-btn" data-find="case" aria-pressed="false" title="Match case">Aa</button>
      <button type="button" class="find-btn" data-find="prev" title="Previous (Shift+Enter)" aria-label="Previous match">↑</button>
      <button type="button" class="find-btn" data-find="next" title="Next (Enter)" aria-label="Next match">↓</button>
      <button type="button" class="find-btn" data-find="toggle-replace" title="Replace (Ctrl+H)" aria-label="Show replace">⇄</button>
      <button type="button" class="find-btn" data-find="close" title="Close (Esc)" aria-label="Close find">×</button>
    </div>
    <div class="find-row replace-row" hidden>
      <input class="replace-input" type="text" placeholder="Replace with" aria-label="Replace with" />
      <button type="button" class="find-btn find-btn-text" data-find="replace">Replace</button>
      <button type="button" class="find-btn find-btn-text" data-find="replace-all">Replace all</button>
    </div>`
  container.append(panel)

  const findInput = panel.querySelector('.find-input')
  const replaceInput = panel.querySelector('.replace-input')
  const replaceRow = panel.querySelector('.replace-row')
  const count = panel.querySelector('.find-count')
  const caseBtn = panel.querySelector('[data-find="case"]')
  let caseSensitive = false

  function state() {
    return findKey.getState(editor.state)
  }

  function updateCount() {
    const { matches, current } = state()
    const q = findInput.value
    count.textContent = !q ? '' : matches.length ? `${current + 1} / ${matches.length}` : 'No results'
    count.classList.toggle('is-none', Boolean(q) && matches.length === 0)
  }

  function search() {
    editor.commands.setFindQuery(findInput.value, { caseSensitive })
    revealCurrentMatch(editor)
    updateCount()
  }

  function move(direction) {
    if (editor.commands.findNext(direction)) revealCurrentMatch(editor)
    updateCount()
  }

  function open({ replace = false } = {}) {
    panel.hidden = false
    if (replace) replaceRow.hidden = false
    // 選択中の文字があれば、それを検索語にする
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to, ' ')
    if (selected && !selected.includes('\n') && selected.length <= 100) findInput.value = selected
    findInput.focus()
    findInput.select()
    search()
  }

  function close() {
    panel.hidden = true
    editor.commands.clearFind()
    editor.commands.focus()
  }

  findInput.addEventListener('input', search)
  findInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      move(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  replaceInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      replaceOne()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })

  function replaceOne() {
    if (editor.commands.replaceCurrent(replaceInput.value)) revealCurrentMatch(editor)
    updateCount()
  }

  panel.addEventListener('click', (e) => {
    const action = e.target instanceof Element ? e.target.closest('[data-find]')?.dataset.find : null
    if (action === 'next') move(1)
    else if (action === 'prev') move(-1)
    else if (action === 'close') close()
    else if (action === 'toggle-replace') {
      replaceRow.hidden = !replaceRow.hidden
      if (!replaceRow.hidden) replaceInput.focus()
    } else if (action === 'case') {
      caseSensitive = !caseSensitive
      caseBtn.setAttribute('aria-pressed', String(caseSensitive))
      search()
    } else if (action === 'replace') replaceOne()
    else if (action === 'replace-all') {
      const n = state().matches.length
      if (editor.commands.replaceAll(replaceInput.value)) {
        updateCount()
        count.textContent = `Replaced ${n}`
      }
    }
  })

  // 文書が変わったら件数を更新（編集で一致が増減する）
  editor.on('transaction', () => {
    if (!panel.hidden) updateCount()
  })

  return {
    open,
    close,
    get isOpen() {
      return !panel.hidden
    },
  }
}
