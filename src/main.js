import './style.css'
import { createEditor, serializeRange } from './editor.js'
import { SlashCommand } from './slash-command.js'
import { setupTableControls } from './table-controls.js'
import { closeTablePicker } from './table-picker.js'
import { extractHeadings, sectionRange } from './markdown-utils.js'
import { searchDocs } from './search.js'
import { renderSnippet } from './ui/snippet.js'
import { isQuickSwitcherOpen, openQuickSwitcher } from './ui/quick-switcher.js'
import { setupFindPanel } from './ui/find-panel.js'
import { setupTheme } from './theme.js'
import { collectTodos, countOpenTodos, extractTodos, setTodoChecked } from './todos.js'
import { toSlackMrkdwn } from './slack.js'
import {
  STORAGE_KEY,
  createDoc,
  deleteDoc,
  deriveTitle,
  exportBackup,
  importBackup,
  listDocs,
  loadState,
  saveState,
  selectDoc,
  updateDocContent,
} from './store.js'
import { WELCOME_MARKDOWN } from './welcome.js'
import { createFolderController } from './folder-controller.js'

const $ = (sel) => document.querySelector(sel)
const els = {
  docList: $('#doc-list'),
  docSearch: $('#doc-search'),
  todoButton: $('#open-todos'),
  todoView: $('#todo-view'),
  newDoc: $('#new-doc'),
  scroll: $('#editor-scroll'),
  editor: $('#editor'),
  raw: $('#raw'),
  toc: $('#toc'),
  saveStatus: $('#save-status'),
  copyAll: $('#copy-all'),
  modeToggle: $('#mode-toggle'),
  toggleSidebar: $('#toggle-sidebar'),
  menu: $('#more-menu'),
  importInput: $('#import-input'),
  toast: $('#toast'),
  folderStatus: $('#folder-status'),
  folderChoose: $('[data-action="folder-choose"]'),
  folderDisconnect: $('[data-action="folder-disconnect"]'),
}

const storage = window.localStorage

// ---------- テーマ ----------
const theme = setupTheme({
  storage,
  onChange: ({ preference }) => {
    document.querySelectorAll('[data-action^="theme-"]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.action === `theme-${preference}`))
    })
  },
})
const newId = () => crypto.randomUUID()

// ---------- 状態 ----------
let { state, recovered } = loadState(storage)
if (Object.keys(state.docs).length === 0) {
  state = createDoc(state, { id: newId(), now: Date.now(), content: WELCOME_MARKDOWN })
}
if (!state.currentId) state = selectDoc(state, listDocs(state)[0].id)
persist()

if (recovered) {
  toast('Saved data could not be read, so it was set aside and a fresh start was made (kept under ' + STORAGE_KEY + ':corrupt-…)', 8000)
}
// ブラウザに「このサイトのデータを勝手に消さないで」と頼む（対応ブラウザのみ）
navigator.storage?.persist?.().catch(() => {})

const currentDoc = () => state.docs[state.currentId]

// ---------- エディター ----------
let rawMode = false
let saveTimer = null
let tocTimer = null

const editor = createEditor({
  element: els.editor,
  markdown: currentDoc().content,
  slashCommand: SlashCommand,
  onUpdate: () => {
    scheduleSave()
    scheduleToc()
  },
})
const tableControls = setupTableControls(editor, els.scroll)
const findPanel = setupFindPanel(editor, document.body)

function currentMarkdown() {
  return rawMode ? els.raw.value : editor.getMarkdown()
}

// ---------- 保存 ----------
function persist() {
  const result = saveState(storage, state)
  if (!result.ok) {
    setSaveStatus('Save failed', true)
    toast('Could not save to the browser, possibly because storage is full. Export a backup from the … menu.', 10000)
  }
  return result.ok
}

function scheduleSave() {
  setSaveStatus('Editing…')
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 500)
}

// 編集が保留中のときだけ書き込む。開いただけのドキュメントを、Markdown の正規化差分で
// 「更新」扱いにして一覧の並びを変えないため。
function flushSave() {
  if (saveTimer == null) return
  clearTimeout(saveTimer)
  saveTimer = null
  const doc = currentDoc()
  if (!doc) return
  const next = updateDocContent(state, doc.id, currentMarkdown(), Date.now())
  if (next === state) {
    setSaveStatus('Saved')
    return
  }
  state = next
  if (persist()) setSaveStatus('Saved')
  folder.saveDoc(currentDoc())
  renderDocList()
}

function setSaveStatus(text, isError = false) {
  els.saveStatus.textContent = text
  els.saveStatus.classList.toggle('is-error', isError)
}

window.addEventListener('beforeunload', flushSave)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave()
})

// 別タブでの変更を取り込む（古い状態で上書きして消さないため）
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return
  if (saveTimer) flushSave()
  const before = currentDoc()?.content
  const loaded = loadState(storage).state
  state = { ...loaded, currentId: loaded.docs[state.currentId] ? state.currentId : loaded.currentId }
  if (!currentDoc()) {
    state = createDoc(state, { id: newId(), now: Date.now() })
    persist()
  }
  if (currentDoc().content !== before) loadIntoEditor()
  renderDocList()
})

// ---------- ドキュメント一覧 ----------
function renderDocList() {
  els.docList.innerHTML = ''
  const query = els.docSearch.value.trim()
  const docs = query ? searchDocs(state.docs, query) : listDocs(state)
  if (query && docs.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'doc-empty'
    empty.textContent = 'No matches'
    els.docList.append(empty)
  }
  updateTodoButton()
  for (const doc of docs) {
    const li = document.createElement('li')
    li.className = 'doc-item' + (doc.id === state.currentId ? ' is-active' : '')

    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'doc-open'
    open.addEventListener('click', () => switchDoc(doc.id))
    const title = document.createElement('span')
    title.className = 'doc-title'
    title.textContent = doc.title
    const time = document.createElement('span')
    time.className = 'doc-time'
    time.textContent = formatTime(doc.updatedAt)
    open.append(title)
    if (doc.snippet) open.append(renderSnippet(doc.snippet, 'doc-snippet'))
    open.append(time)
    if (doc.id === state.currentId) open.setAttribute('aria-current', 'page')

    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'doc-delete'
    del.title = 'Delete'
    del.setAttribute('aria-label', `Delete “${doc.title}”`)
    del.textContent = '×'
    del.addEventListener('click', () => removeDoc(doc.id, doc.title))

    li.append(open, del)
    els.docList.append(li)
  }
}

function switchDoc(id) {
  if (todoViewOpen) closeTodoView()
  if (id === state.currentId) return
  flushSave()
  state = selectDoc(state, id)
  persist()
  loadIntoEditor()
  renderDocList()
  document.body.classList.remove('sidebar-open')
}

function loadIntoEditor() {
  closeTablePicker()
  tableControls.reset()
  const content = currentDoc().content
  editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false })
  if (rawMode) els.raw.value = content
  els.scroll.scrollTop = 0
  pinnedTocIndex = null
  renderToc()
  setSaveStatus('Saved')
}

function addDoc(content = '') {
  if (todoViewOpen) closeTodoView()
  flushSave()
  state = createDoc(state, { id: newId(), now: Date.now(), content })
  persist()
  loadIntoEditor()
  renderDocList()
  document.body.classList.remove('sidebar-open')
  if (rawMode) els.raw.focus()
  else focusEditor(content ? 'end' : 'start')
  if (content) scheduleSave()
}

// Tiptap の focus() は次フレームまで遅れるため、その間のキー入力が押したボタン側に入ってしまう
// （スペースで「新しいドキュメント」がもう一度押される等）。同期的にもフォーカスを移す。
function focusEditor(position) {
  editor.commands.focus(position)
  editor.view.focus()
}

function removeDoc(id, title) {
  const fileNote = folder.connected ? '\nThe .md file in the folder will be deleted too.' : ''
  if (!window.confirm(`Delete “${title}”?${fileNote}\nThis cannot be undone.`)) return
  if (id === state.currentId) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const wasCurrent = id === state.currentId
  state = deleteDoc(state, id)
  folder.removeDoc(id)
  if (!state.currentId) state = createDoc(state, { id: newId(), now: Date.now() })
  persist()
  if (wasCurrent || Object.keys(state.docs).length === 1) loadIntoEditor()
  renderDocList()
}

function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (n) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay) return `Today ${hm}`
  return `${d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '/'}${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

// ---------- 目次 ----------
let headingCache = []

function scheduleToc() {
  clearTimeout(tocTimer)
  tocTimer = setTimeout(renderToc, 150)
}

function renderToc() {
  headingCache = extractHeadings(editor.state.doc)
  els.toc.innerHTML = ''
  if (todoViewOpen) {
    els.toc.append(note('Showing to-dos'))
    return
  }
  if (rawMode) {
    els.toc.append(note('The outline is not available in Markdown mode'))
    return
  }
  if (headingCache.length === 0) {
    els.toc.append(note('Headings you write with # will appear here'))
    return
  }
  const minLevel = Math.min(...headingCache.map((h) => h.level))
  headingCache.forEach((h, i) => {
    const row = document.createElement('div')
    row.className = 'toc-row'
    const a = document.createElement('a')
    a.href = '#'
    a.className = 'toc-item'
    a.style.paddingLeft = `${(h.level - minLevel) * 14 + 8}px`
    a.textContent = h.text
    a.title = h.text
    a.dataset.index = String(i)
    a.addEventListener('click', (e) => {
      e.preventDefault()
      jumpToHeading(i)
    })
    // 右クリックでもその節をコピーできる
    a.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      copySection(i)
    })
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'toc-copy'
    copy.textContent = 'Copy'
    copy.title = 'Copy this section (up to the next heading of the same level)'
    copy.setAttribute('aria-label', `Copy section “${h.text}”`)
    copy.addEventListener('click', () => copySection(i))
    row.append(a, copy)
    els.toc.append(row)
  })
  updateActiveToc()
}

function note(text) {
  const p = document.createElement('p')
  p.className = 'toc-empty'
  p.textContent = text
  return p
}

function jumpToHeading(index) {
  const heading = headingCache[index]
  if (!heading) return
  const dom = editor.view.nodeDOM(heading.pos)
  editor.chain().setTextSelection(heading.pos + 1).focus(undefined, { scrollIntoView: false }).run()
  if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // 文書末尾付近の見出しは先頭までスクロールできないので、クリックしたものを明示的に選択状態にする
  pinnedTocIndex = index
  setActiveToc(index)
}

let pinnedTocIndex = null
els.scroll.addEventListener('wheel', () => (pinnedTocIndex = null), { passive: true })
els.scroll.addEventListener('touchmove', () => (pinnedTocIndex = null), { passive: true })

function setActiveToc(index) {
  els.toc.querySelectorAll('.toc-item').forEach((a, i) => a.classList.toggle('is-active', i === index))
}

function updateActiveToc() {
  if (pinnedTocIndex != null && pinnedTocIndex < headingCache.length) return setActiveToc(pinnedTocIndex)
  const top = els.scroll.getBoundingClientRect().top + 40
  let active = 0
  headingCache.forEach((h, i) => {
    const dom = editor.view.nodeDOM(h.pos)
    if (dom instanceof HTMLElement && dom.getBoundingClientRect().top <= top) active = i
  })
  setActiveToc(active)
}

els.scroll.addEventListener('scroll', () => requestAnimationFrame(updateActiveToc), { passive: true })

// ---------- Markdown 表示切替 ----------
function setRawMode(on) {
  if (todoViewOpen) closeTodoView()
  flushSave()
  rawMode = on
  if (on) {
    els.raw.value = editor.getMarkdown()
  } else {
    editor.commands.setContent(els.raw.value, { contentType: 'markdown', emitUpdate: false })
  }
  els.editor.hidden = on
  els.raw.hidden = !on
  syncModeToggle()
  tableControls.reset()
  if (on && findPanel.isOpen) findPanel.close()
  renderToc()
  if (on) els.raw.focus()
  else focusEditor()
}

els.raw.addEventListener('input', scheduleSave)
// Rich / Markdown の切り替え（ラジオボタン相当のセグメント）
function syncModeToggle() {
  const mode = rawMode ? 'markdown' : 'rich'
  els.modeToggle.dataset.mode = mode
  els.modeToggle.querySelectorAll('[data-mode]').forEach((btn) => {
    const selected = btn.dataset.mode === mode
    btn.setAttribute('aria-checked', String(selected))
    btn.tabIndex = selected ? 0 : -1
  })
}

els.modeToggle.addEventListener('click', (e) => {
  const mode = e.target instanceof Element ? e.target.closest('button[data-mode]')?.dataset.mode : null
  if (mode && (mode === 'markdown') !== rawMode) setRawMode(mode === 'markdown')
})
els.modeToggle.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
  e.preventDefault()
  setRawMode(!rawMode)
  els.modeToggle.querySelector(`[data-mode="${rawMode ? 'markdown' : 'rich'}"]`)?.focus()
})

// ---------- コピー・書き出し ----------
async function copyAll({ markdownOnly = false } = {}) {
  flushSave()
  const markdown = currentMarkdown()
  if (rawMode) editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
  await writeClipboard({
    markdown,
    html: markdownOnly ? null : editor.getHTML(),
    message: markdownOnly ? 'Copied as Markdown text' : 'Copied everything (ready to paste into Notion)',
  })
}

function copySection(index) {
  const heading = headingCache[index]
  const range = heading && sectionRange(editor.state.doc, heading.pos)
  if (!range) return
  const { markdown, html } = serializeRange(editor, range.from, range.to)
  writeClipboard({ markdown, html, message: `Copied section “${heading.text}”` })
}

/** Markdown（text/plain）と HTML（text/html）を一緒に載せる。HTML があると Notion などで見出しや表が再現される。 */
async function writeClipboard({ markdown, html, message }) {
  try {
    if (html && window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
    } else {
      await navigator.clipboard.writeText(markdown)
    }
    toast(message)
  } catch {
    legacyCopy(markdown)
  }
}

function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.append(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  toast(ok ? 'Copied as Markdown text' : 'Could not copy. Check your browser’s clipboard permissions.')
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|\n\r]/g, '_').slice(0, 80) || 'untitled'
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

const menuActions = {
  'copy-markdown': () => copyAll({ markdownOnly: true }),
  'copy-slack': () => {
    flushSave()
    writeClipboard({
      markdown: toSlackMrkdwn(currentMarkdown()),
      html: null,
      message: 'Copied with Slack formatting',
    })
  },
  'download-md': () => {
    flushSave()
    const md = currentMarkdown()
    download(`${safeFilename(deriveTitle(md))}.md`, md, 'text/markdown')
  },
  'export-backup': () => {
    flushSave()
    download(`sugumd-backup-${timestamp()}.json`, JSON.stringify(exportBackup(state, Date.now()), null, 2), 'application/json')
    toast('Exported a backup of all documents')
  },
  'import-backup': () => els.importInput.click(),
  'theme-system': () => theme.setPreference('system'),
  'theme-light': () => theme.setPreference('light'),
  'theme-dark': () => theme.setPreference('dark'),
  'folder-choose': () => folder.choose().catch(folderError),
  'folder-disconnect': () => {
    folder.disconnect()
    toast('Disconnected the folder (files in it are kept)')
  },
}

els.menu.addEventListener('click', (e) => {
  const action = e.target instanceof Element ? e.target.closest('[data-action]')?.dataset.action : null
  if (!action) return
  els.menu.removeAttribute('open')
  menuActions[action]?.()
})
document.addEventListener('click', (e) => {
  if (!els.menu.contains(e.target)) els.menu.removeAttribute('open')
})

els.importInput.addEventListener('change', async () => {
  const file = els.importInput.files?.[0]
  els.importInput.value = ''
  if (!file) return
  flushSave()
  try {
    const result = importBackup(state, JSON.parse(await file.text()))
    state = result.state
    persist()
    loadIntoEditor()
    renderDocList()
    folder.resync()
    toast(`Restored: ${result.added} added, ${result.updated} updated, ${result.skipped} unchanged`, 6000)
  } catch (err) {
    toast(`Could not restore: ${err.message}`, 6000)
  }
})

els.copyAll.addEventListener('click', () => copyAll())
els.newDoc.addEventListener('click', () => addDoc())
els.docSearch.addEventListener('input', renderDocList)
els.docSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    els.docSearch.value = ''
    renderDocList()
  } else if (e.key === 'Enter' && !e.isComposing) {
    // 検索結果の先頭を開く
    els.docList.querySelector('.doc-open')?.click()
  }
})

function showQuickSwitcher() {
  flushSave()
  openQuickSwitcher({
    search: (query) => searchDocs(state.docs, query),
    onPick: (id) => {
      switchDoc(id)
      // Tiptap の focus() は次フレームに遅れて走り、直後に開いたダイアログの入力を奪うので、同期の focus だけ使う
      if (rawMode) els.raw.focus()
      else editor.view.focus()
    },
    onCreate: (title) => addDoc(`# ${title}\n\n`),
  })
}
els.toggleSidebar.addEventListener('click', () => document.body.classList.toggle('sidebar-open'))

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey
  if (!mod || e.isComposing) return
  const key = e.key.toLowerCase()
  if (key === 'm' && e.shiftKey) {
    e.preventDefault()
    setRawMode(!rawMode)
  } else if (key === 's') {
    e.preventDefault()
    flushSave()
    toast('Saved')
  } else if (key === 'k' && !e.shiftKey && !e.altKey) {
    e.preventDefault()
    if (!isQuickSwitcherOpen()) showQuickSwitcher()
  } else if (!rawMode && !todoViewOpen && (key === 'f' || e.code === 'KeyF') && !e.shiftKey) {
    // Ctrl/Cmd+F で検索、Ctrl/Cmd+Option+F で置換（Mac は Cmd+H がアプリを隠すため）
    e.preventDefault()
    findPanel.open({ replace: e.altKey })
  } else if (!rawMode && !todoViewOpen && key === 'h' && e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    findPanel.open({ replace: true })
  }
})

// ---------- トースト ----------
let toastTimer = null
function toast(message, ms = 2500) {
  els.toast.textContent = message
  els.toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    els.toast.hidden = true
  }, ms)
}

// ---------- ToDo 一覧 ----------
let todoViewOpen = false
let todoIncludeDone = false
// この一覧を開いている間にチェックしたものは、完了済みを隠していても消さずに残す（押した手応えのため）
let todoJustChanged = new Set()

function updateTodoButton() {
  const n = countOpenTodos(state.docs)
  els.todoButton.textContent = n ? `☑ To-dos (${n})` : '☑ To-dos'
}

function openTodoView() {
  flushSave()
  if (findPanel.isOpen) findPanel.close()
  tableControls.reset()
  todoViewOpen = true
  todoJustChanged = new Set()
  els.editor.hidden = true
  els.raw.hidden = true
  els.todoView.hidden = false
  els.todoButton.setAttribute('aria-pressed', 'true')
  els.scroll.scrollTop = 0
  renderTodoView()
  renderToc()
  document.body.classList.remove('sidebar-open')
}

function closeTodoView() {
  todoViewOpen = false
  els.todoView.hidden = true
  els.editor.hidden = rawMode
  els.raw.hidden = !rawMode
  els.todoButton.setAttribute('aria-pressed', 'false')
  renderToc()
}

function renderTodoView() {
  const view = els.todoView
  view.innerHTML = ''
  const header = document.createElement('div')
  header.className = 'todo-header'
  const h = document.createElement('h1')
  h.textContent = 'To-dos'
  const showDone = document.createElement('label')
  showDone.className = 'todo-show-done'
  const showDoneInput = document.createElement('input')
  showDoneInput.type = 'checkbox'
  showDoneInput.checked = todoIncludeDone
  showDoneInput.addEventListener('change', () => {
    todoIncludeDone = showDoneInput.checked
    renderTodoView()
  })
  showDone.append(showDoneInput, document.createTextNode(' Show completed'))
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'btn btn-ghost'
  close.textContent = 'Close'
  close.addEventListener('click', () => {
    closeTodoView()
    focusEditor()
  })
  header.append(h, showDone, close)
  view.append(header)

  const groups = collectTodos(state.docs, { includeDone: true })
    .map((g) => ({
      ...g,
      todos: g.todos.filter((t) => todoIncludeDone || !t.checked || todoJustChanged.has(`${g.id}:${t.line}`)),
    }))
    .filter((g) => g.todos.length > 0)

  if (groups.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'todo-empty'
    empty.textContent = todoIncludeDone
      ? 'No to-dos yet. Type “[] ” or “- [ ] ” in a document to add one.'
      : 'All done 🎉'
    view.append(empty)
    return
  }

  for (const group of groups) {
    const section = document.createElement('section')
    section.className = 'todo-group'
    const title = document.createElement('button')
    title.type = 'button'
    title.className = 'todo-doc'
    title.textContent = group.title
    title.addEventListener('click', () => jumpToTodo(group.id, null))
    const list = document.createElement('ul')
    list.className = 'todo-list'
    for (const todo of group.todos) {
      const li = document.createElement('li')
      li.className = 'todo-item' + (todo.checked ? ' is-done' : '')
      li.style.paddingLeft = `${todo.depth * 22}px`
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = todo.checked
      box.setAttribute('aria-label', todo.text)
      box.addEventListener('change', () => toggleTodo(group.id, todo.line, box.checked))
      const text = document.createElement('button')
      text.type = 'button'
      text.className = 'todo-text'
      text.textContent = todo.text || '(empty to-do)'
      text.title = 'Open in document'
      text.addEventListener('click', () => jumpToTodo(group.id, todo.line))
      li.append(box, text)
      list.append(li)
    }
    section.append(title, list)
    view.append(section)
  }
}

function toggleTodo(id, line, checked) {
  flushSave()
  const doc = state.docs[id]
  const next = doc && setTodoChecked(doc.content, line, checked)
  if (!next) {
    toast('The document had changed, so the list was refreshed')
    renderTodoView()
    return
  }
  state = updateDocContent(state, id, next, Date.now())
  persist()
  folder.saveDoc(state.docs[id])
  if (id === state.currentId) {
    editor.commands.setContent(next, { contentType: 'markdown', emitUpdate: false })
    if (rawMode) els.raw.value = next
  }
  todoJustChanged.add(`${id}:${line}`)
  renderDocList()
  renderTodoView()
}

/** ドキュメントを開き、その ToDo の行へ移動する。 */
function jumpToTodo(id, line) {
  const index = line == null ? -1 : extractTodos(state.docs[id]?.content ?? '').findIndex((t) => t.line === line)
  closeTodoView()
  switchDoc(id)
  if (rawMode) {
    els.raw.focus()
    return
  }
  // Markdown の n 番目の ToDo ＝ 文書中の n 番目の taskItem
  let target = null
  let n = 0
  editor.state.doc.descendants((node, pos) => {
    if (target != null) return false
    if (node.type.name === 'taskItem') {
      if (n === index) target = pos
      n++
    }
    return true
  })
  if (target == null) return focusEditor('start')
  editor.chain().setTextSelection(target + 2).run()
  editor.view.focus()
  const dom = editor.view.nodeDOM(target)
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ block: 'center' })
    dom.classList.add('is-flash')
    setTimeout(() => dom.classList.remove('is-flash'), 1200)
  }
}

els.todoButton.addEventListener('click', () => (todoViewOpen ? closeTodoView() : openTodoView()))

// ---------- フォルダ保存 ----------
const FOLDER_LABELS = {
  syncing: (name) => `📁 Syncing ${name}…`,
  connected: (name) => `📁 ${name}`,
  reconnect: () => '📁 Reconnect folder',
  error: () => '📁 Folder save failed',
}

function folderError(err) {
  console.error(err)
  toast(`Could not save to the folder: ${err?.message ?? err}`, 8000)
}

function renderFolderStatus({ status, folderName }) {
  const label = FOLDER_LABELS[status]
  els.folderStatus.hidden = !label
  if (label) els.folderStatus.textContent = label(folderName)
  els.folderStatus.dataset.status = status
  els.folderStatus.title =
    status === 'connected'
      ? `Saving as .md files in “${folderName}”`
      : status === 'reconnect'
        ? 'The browser was reopened, so folder access needs to be granted again'
        : status === 'error'
          ? 'Click to reconnect'
          : ''
  const supported = status !== 'unsupported'
  els.folderChoose.disabled = !supported
  els.folderChoose.textContent = !supported
    ? 'Save to a folder (Chrome / Edge only)'
    : status === 'none'
      ? 'Also save to a folder…'
      : 'Change folder…'
  els.folderDisconnect.hidden = status === 'none' || status === 'unsupported'
}

const folder = createFolderController({
  getDocs: () => state.docs,
  newId,
  applyUpserts(docs) {
    if (docs.length === 0) return
    flushSave()
    const before = currentDoc()?.content
    state = { ...state, docs: { ...state.docs, ...Object.fromEntries(docs.map((d) => [d.id, d])) } }
    persist()
    if (currentDoc()?.content !== before) loadIntoEditor()
    renderDocList()
  },
  onStatus: renderFolderStatus,
  onError: folderError,
  onSynced(plan) {
    const parts = []
    if (plan.upserts.length) parts.push(`${plan.upserts.length} imported`)
    if (plan.writes.length) parts.push(`${plan.writes.length} written`)
    if (parts.length) toast(`Synced with folder (${parts.join(', ')})`, 4000)
  },
})

els.folderStatus.addEventListener('click', () => {
  const status = els.folderStatus.dataset.status
  if (status === 'reconnect' || status === 'error') folder.reconnect().catch(folderError)
  else if (status === 'connected') toast(els.folderStatus.title, 4000)
})

// ---------- 初期描画 ----------
renderDocList()
renderToc()
setSaveStatus('Saved')
folder.init().catch(folderError)
