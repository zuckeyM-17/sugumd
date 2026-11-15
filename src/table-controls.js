// 表の操作 UI。
// - 表にマウスを乗せると、下端と右端に「+」バーが出て、行・列を末尾に足せる
// - カーソルが表の中にあると、表の上に行/列の追加・削除ツールバーが出る
import { ensureFocus } from './focus.js'

/** 表ノードの、最終行の先頭セルと 1 行目の最終セルの位置を返す。 */
export function findEdgeCells(tableNode, tablePos) {
  const rows = []
  tableNode.forEach((row, offset) => rows.push({ row, pos: tablePos + 1 + offset }))
  const firstRow = rows[0]
  const lastRow = rows[rows.length - 1]
  let lastColCellPos = firstRow.pos + 1
  firstRow.row.forEach((_cell, offset) => {
    lastColCellPos = firstRow.pos + 1 + offset
  })
  return { lastRowCellPos: lastRow.pos + 1, lastColCellPos }
}

/** 位置 pos を含む表ノードとその位置。表の外なら null。 */
export function findTableAt(doc, pos) {
  const $pos = doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name === 'table') return { node, pos: $pos.before(d) }
  }
  return null
}

// セル位置 + 2 = セル内段落のテキスト先頭
const insideCell = (cellPos) => cellPos + 2

export function appendRow(editor, tablePos) {
  const table = editor.state.doc.nodeAt(tablePos)
  const { lastRowCellPos } = findEdgeCells(table, tablePos)
  ensureFocus(editor)
  editor.chain().setTextSelection(insideCell(lastRowCellPos)).addRowAfter().run()
}

export function appendColumn(editor, tablePos) {
  const table = editor.state.doc.nodeAt(tablePos)
  const { lastColCellPos } = findEdgeCells(table, tablePos)
  ensureFocus(editor)
  editor.chain().setTextSelection(insideCell(lastColCellPos)).addColumnAfter().run()
}

const TOOLBAR_ACTIONS = [
  { label: 'Insert row above', title: 'Insert a row above', run: (c) => c.addRowBefore() },
  { label: 'Insert row below', title: 'Insert a row below', run: (c) => c.addRowAfter() },
  { label: 'Insert column left', title: 'Insert a column to the left', run: (c) => c.addColumnBefore() },
  { label: 'Insert column right', title: 'Insert a column to the right', run: (c) => c.addColumnAfter() },
  { label: 'Delete row', title: 'Delete the row with the cursor', run: (c) => c.deleteRow(), danger: true },
  { label: 'Delete column', title: 'Delete the column with the cursor', run: (c) => c.deleteColumn(), danger: true },
  { label: 'Delete table', title: 'Delete the whole table', run: (c) => c.deleteTable(), danger: true },
]

export function setupTableControls(editor, container) {
  // カーソルが表の中にあるとき、表の右上に小さな「表 ▾」ボタンを出し、押すと操作一覧を開く。
  // 常時ツールバーを出すと、表の上の見出しや下の段落をクリックできなくなるため。
  const toolbar = document.createElement('div')
  toolbar.className = 'table-toolbar'
  toolbar.hidden = true
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'table-toolbar-trigger'
  trigger.textContent = 'Table ▾'
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.title = 'Add or delete rows and columns'
  const menu = document.createElement('div')
  menu.className = 'table-toolbar-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true
  for (const action of TOOLBAR_ACTIONS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.setAttribute('role', 'menuitem')
    btn.className = 'table-toolbar-btn' + (action.danger ? ' is-danger' : '')
    btn.textContent = action.label
    btn.title = action.title
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      setMenuOpen(false)
      ensureFocus(editor)
      action.run(editor.chain()).run()
    })
    menu.append(btn)
  }
  toolbar.append(trigger, menu)
  trigger.addEventListener('mousedown', (e) => {
    e.preventDefault() // エディターのフォーカス（＝表内のカーソル位置）を保つ
    setMenuOpen(menu.hidden)
  })

  function setMenuOpen(open) {
    menu.hidden = !open
    trigger.setAttribute('aria-expanded', String(open))
  }

  const addRowBtn = edgeButton('table-add-row', 'Add a row at the end')
  const addColBtn = edgeButton('table-add-col', 'Add a column at the end')
  container.append(toolbar, addRowBtn, addColBtn)

  let hoveredTablePos = null
  let hideTimer = null

  function tableDom(tablePos) {
    const dom = editor.view.nodeDOM(tablePos)
    if (!(dom instanceof HTMLElement)) return null
    return dom.tagName === 'TABLE' ? dom : dom.querySelector('table')
  }

  function relativeRect(el) {
    const r = el.getBoundingClientRect()
    const c = container.getBoundingClientRect()
    const wrapper = el.parentElement
    const right = wrapper ? Math.min(r.right, wrapper.getBoundingClientRect().right) : r.right
    return {
      top: r.top - c.top + container.scrollTop,
      left: r.left - c.left + container.scrollLeft,
      width: right - r.left,
      height: r.height,
    }
  }

  function showEdgeButtons(tablePos) {
    const table = tableDom(tablePos)
    if (!table) return hideEdgeButtons()
    hoveredTablePos = tablePos
    const rect = relativeRect(table)
    Object.assign(addRowBtn.style, { top: `${rect.top + rect.height + 2}px`, left: `${rect.left}px`, width: `${rect.width}px` })
    Object.assign(addColBtn.style, { top: `${rect.top}px`, left: `${rect.left + rect.width + 2}px`, height: `${rect.height}px` })
    addRowBtn.hidden = false
    addColBtn.hidden = false
  }

  function hideEdgeButtons() {
    hoveredTablePos = null
    addRowBtn.hidden = true
    addColBtn.hidden = true
  }

  // マウスが表から離れたら隠す。ただしカーソルが表の中にある間は残す
  // （タッチ端末ではタップのたびにマウス相当のイベントが飛び、「離れた」と判定されてしまうため）
  function scheduleHide() {
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      const found = editor.isFocused ? findTableAt(editor.state.doc, editor.state.selection.from) : null
      if (found) showEdgeButtons(found.pos)
      else hideEdgeButtons()
    }, 250)
  }

  editor.view.dom.addEventListener('mousemove', (e) => {
    const table = e.target instanceof Element ? e.target.closest('table') : null
    if (!table) return scheduleHide()
    clearTimeout(hideTimer)
    const found = findTableAt(editor.state.doc, editor.view.posAtDOM(table, 0))
    if (found) showEdgeButtons(found.pos)
  })
  editor.view.dom.addEventListener('mouseleave', scheduleHide)

  for (const btn of [addRowBtn, addColBtn]) {
    btn.addEventListener('mouseenter', () => clearTimeout(hideTimer))
    btn.addEventListener('mouseleave', scheduleHide)
  }
  addRowBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    if (hoveredTablePos == null) return
    appendRow(editor, hoveredTablePos)
    showEdgeButtons(hoveredTablePos)
  })
  addColBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    if (hoveredTablePos == null) return
    appendColumn(editor, hoveredTablePos)
    showEdgeButtons(hoveredTablePos)
  })

  function updateToolbar() {
    const found = editor.isEditable ? findTableAt(editor.state.doc, editor.state.selection.from) : null
    const table = found && tableDom(found.pos)
    if (!table || !editor.isFocused) {
      toolbar.hidden = true
      setMenuOpen(false)
      return
    }
    if (toolbar.hidden) setMenuOpen(false)
    toolbar.hidden = false
    const rect = relativeRect(table)
    toolbar.style.top = `${Math.max(0, rect.top - trigger.offsetHeight - 4)}px`
    toolbar.style.left = `${rect.left + rect.width - trigger.offsetWidth}px`
    // タッチ端末にはマウスを乗せる操作がないので、カーソルが表の中にあれば「+」を出す
    showEdgeButtons(found.pos)
  }

  editor.on('selectionUpdate', updateToolbar)
  editor.on('update', updateToolbar)
  editor.on('focus', updateToolbar)
  editor.on('blur', () => {
    toolbar.hidden = true
    setMenuOpen(false)
    scheduleHide() // マウスが表の上にあれば mousemove で出し直される
  })

  return {
    reset() {
      toolbar.hidden = true
      setMenuOpen(false)
      hideEdgeButtons()
    },
  }
}

function edgeButton(className, label) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `table-add ${className}`
  btn.textContent = '+'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.hidden = true
  return btn
}
