// 「/」で開くコマンドメニュー。Notion のように行頭以外でも呼べる。
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { parseTableSize } from './markdown-utils.js'
import { openTablePicker } from './table-picker.js'
import { CALLOUT_TYPES } from './extensions/callout.js'

export const COMMANDS = [
  { id: 'h1', label: '見出し1', hint: '#', keywords: ['h1', 'heading', 'midashi'], run: (c) => c.setNode('heading', { level: 1 }) },
  { id: 'h2', label: '見出し2', hint: '##', keywords: ['h2', 'heading', 'midashi'], run: (c) => c.setNode('heading', { level: 2 }) },
  { id: 'h3', label: '見出し3', hint: '###', keywords: ['h3', 'heading', 'midashi'], run: (c) => c.setNode('heading', { level: 3 }) },
  { id: 'table', label: 'テーブル', hint: '/3x4 でサイズ指定', keywords: ['table', 'hyou', '表'], run: null },
  { id: 'bullet', label: '箇条書き', hint: '-', keywords: ['bullet', 'list', 'ul'], run: (c) => c.toggleBulletList() },
  { id: 'ordered', label: '番号付きリスト', hint: '1.', keywords: ['number', 'ordered', 'ol', 'list'], run: (c) => c.toggleOrderedList() },
  { id: 'todo', label: 'ToDo リスト', hint: '[]', keywords: ['todo', 'task', 'check'], run: (c) => c.toggleTaskList() },
  { id: 'quote', label: '引用', hint: '>', keywords: ['quote', 'blockquote', 'inyou'], run: (c) => c.toggleBlockquote() },
  { id: 'code', label: 'コードブロック', hint: '```', keywords: ['code', 'pre'], run: (c) => c.toggleCodeBlock() },
  { id: 'hr', label: '区切り線', hint: '---', keywords: ['hr', 'divider', 'line'], run: (c) => c.setHorizontalRule() },
  { id: 'toggle', label: 'トグル', hint: '<details>', keywords: ['toggle', 'details', 'fold', '折りたたみ', 'toguru'], run: (c) => c.setDetails() },
  ...Object.entries(CALLOUT_TYPES).map(([type, label]) => ({
    id: `callout-${type.toLowerCase()}`,
    label: `コールアウト（${label}）`,
    hint: `> [!${type}]`,
    keywords: ['callout', 'alert', 'note', type.toLowerCase(), label, 'コールアウト'],
    // GitHub と同じく、印は 1 行目に単独で置く（印の段落と本文の段落に分ける）
    run: (c) => c.toggleBlockquote().insertContent(`[!${type}]`).splitBlock(),
  })),
  {
    id: 'mermaid',
    label: 'Mermaid 図',
    hint: '```mermaid',
    keywords: ['mermaid', 'diagram', 'chart', 'flow', '図', 'フロー'],
    run: (c) => c.setCodeBlock({ language: 'mermaid' }).command(({ tr }) => {
      tr.insertText('flowchart LR\n  A[開始] --> B[処理] --> C[終了]')
      return true
    }),
  },
]

/**
 * 検索語に合うコマンドを返す。"3x4" のようなサイズ指定なら表の即時挿入項目だけを出す。
 * 表の中では表を作れない（入れ子の表は Markdown で表せず、保存時に消えるため）。
 */
export function filterCommands(query, { inTable = false } = {}) {
  const size = parseTableSize(query)
  if (size && inTable) return []
  if (size) {
    return [{ id: 'table-sized', label: `テーブル ${size.rows}行 × ${size.cols}列`, hint: '1行目は見出し行', size }]
  }
  const q = query.trim().toLowerCase()
  const available = inTable ? COMMANDS.filter((cmd) => cmd.id !== 'table') : COMMANDS
  if (!q) return available
  return available.filter(
    (cmd) => cmd.label.toLowerCase().includes(q) || cmd.keywords.some((k) => k.includes(q)),
  )
}

export function insertTable(editor, { rows, cols }) {
  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
}

function executeCommand(editor, range, item) {
  if (item.size) {
    editor.chain().focus().deleteRange(range).run()
    insertTable(editor, item.size)
    return
  }
  if (item.id === 'table') {
    editor.chain().focus().deleteRange(range).run()
    const coords = editor.view.coordsAtPos(editor.state.selection.from)
    openTablePicker({
      x: coords.left,
      y: coords.bottom + 6,
      onPick: (size) => insertTable(editor, size),
      onCancel: () => editor.commands.focus(),
    })
    return
  }
  item.run(editor.chain().focus().deleteRange(range)).run()
}

function createMenuRenderer() {
  let el
  let items = []
  let selected = 0
  let command

  const draw = () => {
    el.innerHTML = ''
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'slash-empty'
      empty.textContent = '該当するコマンドがありません'
      el.append(empty)
      return
    }
    items.forEach((item, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'slash-item' + (i === selected ? ' is-selected' : '')
      btn.setAttribute('role', 'option')
      btn.setAttribute('aria-selected', String(i === selected))
      const label = document.createElement('span')
      label.textContent = item.label
      const hint = document.createElement('span')
      hint.className = 'slash-hint'
      hint.textContent = item.hint
      btn.append(label, hint)
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        command(item)
      })
      el.append(btn)
    })
    el.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' })
  }

  const place = (clientRect) => {
    const rect = clientRect?.()
    if (!rect) return
    const menuHeight = el.offsetHeight
    const below = rect.bottom + 6
    const top = below + menuHeight > window.innerHeight ? rect.top - menuHeight - 6 : below
    el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)}px`
    el.style.top = `${Math.max(8, top)}px`
  }

  return {
    onStart(props) {
      el = document.createElement('div')
      el.className = 'slash-menu'
      el.setAttribute('role', 'listbox')
      document.body.append(el)
      items = props.items
      selected = 0
      command = props.command
      draw()
      place(props.clientRect)
    },
    onUpdate(props) {
      items = props.items
      selected = 0
      command = props.command
      draw()
      place(props.clientRect)
    },
    onKeyDown({ event }) {
      if (event.key === 'Escape') {
        el?.remove()
        return true
      }
      if (items.length === 0) return false
      if (event.key === 'ArrowDown') {
        selected = (selected + 1) % items.length
        draw()
        return true
      }
      if (event.key === 'ArrowUp') {
        selected = (selected - 1 + items.length) % items.length
        draw()
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        command(items[selected])
        return true
      }
      return false
    },
    onExit() {
      el?.remove()
      el = null
    },
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        // コードブロック内の「/」はただの文字として扱う
        allow: ({ editor }) => !editor.isActive('codeBlock'),
        items: ({ query, editor }) => filterCommands(query, { inTable: editor.isActive('table') }),
        command: ({ editor, range, props }) => executeCommand(editor, range, props),
        render: createMenuRenderer,
      }),
    ]
  },
})
