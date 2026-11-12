import './style.css'
import { createEditor } from './editor.js'
import { SlashCommand } from './slash-command.js'
import { setupTableControls } from './table-controls.js'
import { closeTablePicker } from './table-picker.js'
import { extractHeadings } from './markdown-utils.js'
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

const $ = (sel) => document.querySelector(sel)
const els = {
  docList: $('#doc-list'),
  newDoc: $('#new-doc'),
  scroll: $('#editor-scroll'),
  editor: $('#editor'),
  raw: $('#raw'),
  toc: $('#toc'),
  saveStatus: $('#save-status'),
  copyAll: $('#copy-all'),
  toggleRaw: $('#toggle-raw'),
  toggleSidebar: $('#toggle-sidebar'),
  menu: $('#more-menu'),
  importInput: $('#import-input'),
  toast: $('#toast'),
}

const storage = window.localStorage
const newId = () => crypto.randomUUID()

// ---------- 状態 ----------
let { state, recovered } = loadState(storage)
if (Object.keys(state.docs).length === 0) {
  state = createDoc(state, { id: newId(), now: Date.now(), content: WELCOME_MARKDOWN })
}
if (!state.currentId) state = selectDoc(state, listDocs(state)[0].id)
persist()

if (recovered) {
  toast('保存データが読めなかったため、退避して新しく始めました（退避先: ' + STORAGE_KEY + ':corrupt-…）', 8000)
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

function currentMarkdown() {
  return rawMode ? els.raw.value : editor.getMarkdown()
}

// ---------- 保存 ----------
function persist() {
  const result = saveState(storage, state)
  if (!result.ok) {
    setSaveStatus('保存に失敗しました', true)
    toast('ブラウザへの保存に失敗しました。容量不足の可能性があります。「…」メニューからバックアップを書き出してください。', 10000)
  }
  return result.ok
}

function scheduleSave() {
  setSaveStatus('編集中…')
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
    setSaveStatus('保存済み')
    return
  }
  state = next
  if (persist()) setSaveStatus('保存済み')
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
  for (const doc of listDocs(state)) {
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
    open.append(title, time)
    if (doc.id === state.currentId) open.setAttribute('aria-current', 'page')

    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'doc-delete'
    del.title = '削除'
    del.setAttribute('aria-label', `「${doc.title}」を削除`)
    del.textContent = '×'
    del.addEventListener('click', () => removeDoc(doc.id, doc.title))

    li.append(open, del)
    els.docList.append(li)
  }
}

function switchDoc(id) {
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
  setSaveStatus('保存済み')
}

function addDoc() {
  flushSave()
  state = createDoc(state, { id: newId(), now: Date.now() })
  persist()
  loadIntoEditor()
  renderDocList()
  document.body.classList.remove('sidebar-open')
  if (rawMode) els.raw.focus()
  else focusEditor('start')
}

// Tiptap の focus() は次フレームまで遅れるため、その間のキー入力が押したボタン側に入ってしまう
// （スペースで「新しいドキュメント」がもう一度押される等）。同期的にもフォーカスを移す。
function focusEditor(position) {
  editor.commands.focus(position)
  editor.view.focus()
}

function removeDoc(id, title) {
  if (!window.confirm(`「${title}」を削除しますか？\nこの操作は取り消せません。`)) return
  if (id === state.currentId) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const wasCurrent = id === state.currentId
  state = deleteDoc(state, id)
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
  if (sameDay) return `今日 ${hm}`
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
  if (rawMode) {
    els.toc.append(note('Markdown表示中は目次を使えません'))
    return
  }
  if (headingCache.length === 0) {
    els.toc.append(note('# で見出しを書くと、ここに目次が出ます'))
    return
  }
  const minLevel = Math.min(...headingCache.map((h) => h.level))
  headingCache.forEach((h, i) => {
    const a = document.createElement('a')
    a.href = '#'
    a.className = 'toc-item'
    a.style.paddingLeft = `${(h.level - minLevel) * 14 + 8}px`
    a.textContent = h.text
    a.dataset.index = String(i)
    a.addEventListener('click', (e) => {
      e.preventDefault()
      jumpToHeading(i)
    })
    els.toc.append(a)
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
  flushSave()
  rawMode = on
  if (on) {
    els.raw.value = editor.getMarkdown()
  } else {
    editor.commands.setContent(els.raw.value, { contentType: 'markdown', emitUpdate: false })
  }
  els.editor.hidden = on
  els.raw.hidden = !on
  els.toggleRaw.textContent = on ? '編集表示に戻る' : 'Markdown表示'
  els.toggleRaw.setAttribute('aria-pressed', String(on))
  tableControls.reset()
  renderToc()
  if (on) els.raw.focus()
  else focusEditor()
}

els.raw.addEventListener('input', scheduleSave)
els.toggleRaw.addEventListener('click', () => setRawMode(!rawMode))

// ---------- コピー・書き出し ----------
async function copyAll({ markdownOnly = false } = {}) {
  flushSave()
  const markdown = currentMarkdown()
  if (rawMode) editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
  try {
    if (!markdownOnly && window.ClipboardItem && navigator.clipboard?.write) {
      // text/html も載せると Notion などに貼ったとき表や見出しがそのまま再現される
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': new Blob([editor.getHTML()], { type: 'text/html' }),
        }),
      ])
    } else {
      await navigator.clipboard.writeText(markdown)
    }
    toast(markdownOnly ? 'Markdown テキストをコピーしました' : '全体をコピーしました（Notion にそのまま貼れます）')
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
  toast(ok ? 'Markdown テキストをコピーしました' : 'コピーできませんでした。ブラウザの権限設定を確認してください')
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
  'download-md': () => {
    flushSave()
    const md = currentMarkdown()
    download(`${safeFilename(deriveTitle(md))}.md`, md, 'text/markdown')
  },
  'export-backup': () => {
    flushSave()
    download(`sugumd-backup-${timestamp()}.json`, JSON.stringify(exportBackup(state, Date.now()), null, 2), 'application/json')
    toast('全ドキュメントのバックアップを書き出しました')
  },
  'import-backup': () => els.importInput.click(),
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
    toast(`復元しました: 追加 ${result.added} 件 / 更新 ${result.updated} 件 / 変更なし ${result.skipped} 件`, 6000)
  } catch (err) {
    toast(`復元できませんでした: ${err.message}`, 6000)
  }
})

els.copyAll.addEventListener('click', () => copyAll())
els.newDoc.addEventListener('click', addDoc)
els.toggleSidebar.addEventListener('click', () => document.body.classList.toggle('sidebar-open'))

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault()
    flushSave()
    toast('保存しました')
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

// ---------- 初期描画 ----------
renderDocList()
renderToc()
setSaveStatus('保存済み')
