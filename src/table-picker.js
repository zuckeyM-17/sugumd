// マス目をなぞって「何行 × 何列」を選ぶポップアップ。キーボード(矢印/Enter/Esc)でも選べる。
import { MAX_TABLE_COLS, MAX_TABLE_ROWS } from './markdown-utils.js'

const GRID_ROWS = 8
const GRID_COLS = 8

let active = null

export function closeTablePicker() {
  active?.close()
}

export function openTablePicker({ x, y, onPick, onCancel }) {
  closeTablePicker()

  let rows = 3
  let cols = 3
  const el = document.createElement('div')
  el.className = 'table-picker'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', 'テーブルのサイズを選ぶ')
  el.tabIndex = -1

  const grid = document.createElement('div')
  grid.className = 'table-picker-grid'
  grid.style.gridTemplateColumns = `repeat(${GRID_COLS}, 18px)`
  const cells = []
  for (let r = 1; r <= GRID_ROWS; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      const cell = document.createElement('div')
      cell.className = 'table-picker-cell'
      cell.addEventListener('mouseenter', () => {
        rows = r
        cols = c
        sync()
      })
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault()
        pick()
      })
      cells.push({ el: cell, r, c })
      grid.append(cell)
    }
  }

  const footer = document.createElement('div')
  footer.className = 'table-picker-footer'
  const rowsInput = numberInput(MAX_TABLE_ROWS, '行数')
  const colsInput = numberInput(MAX_TABLE_COLS, '列数')
  const ok = document.createElement('button')
  ok.type = 'button'
  ok.className = 'btn btn-primary btn-small'
  ok.textContent = '挿入'
  ok.addEventListener('click', () => pick())
  footer.append(rowsInput, text('行 ×'), colsInput, text('列'), ok)

  const note = document.createElement('div')
  note.className = 'table-picker-note'
  note.textContent = '1行目は見出し行になります'

  el.append(grid, footer, note)
  document.body.append(el)

  el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8))}px`
  el.style.top = `${y + el.offsetHeight > window.innerHeight ? Math.max(8, y - el.offsetHeight - 30) : y}px`

  function sync() {
    for (const cell of cells) cell.el.classList.toggle('is-on', cell.r <= rows && cell.c <= cols)
    if (document.activeElement !== rowsInput) rowsInput.value = rows
    if (document.activeElement !== colsInput) colsInput.value = cols
  }

  function readInputs() {
    rows = clamp(Number(rowsInput.value), 1, MAX_TABLE_ROWS)
    cols = clamp(Number(colsInput.value), 1, MAX_TABLE_COLS)
    sync()
  }
  rowsInput.addEventListener('input', readInputs)
  colsInput.addEventListener('input', readInputs)

  function pick() {
    close()
    onPick({ rows, cols })
  }

  function cancel() {
    close()
    onCancel?.()
  }

  function onKeyDown(e) {
    const inInput = e.target instanceof HTMLInputElement
    if (e.key === 'Escape') return void (e.preventDefault(), cancel())
    if (e.key === 'Enter') return void (e.preventDefault(), pick())
    if (inInput) return
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    rows = clamp(rows + move[0], 1, MAX_TABLE_ROWS)
    cols = clamp(cols + move[1], 1, MAX_TABLE_COLS)
    sync()
  }

  function onOutside(e) {
    if (!el.contains(e.target)) cancel()
  }

  function close() {
    el.remove()
    document.removeEventListener('mousedown', onOutside, true)
    active = null
  }

  el.addEventListener('keydown', onKeyDown)
  document.addEventListener('mousedown', onOutside, true)
  active = { close }
  sync()
  el.focus()
}

function numberInput(max, label) {
  const input = document.createElement('input')
  input.type = 'number'
  input.min = '1'
  input.max = String(max)
  input.className = 'table-picker-input'
  input.setAttribute('aria-label', label)
  return input
}

function text(s) {
  const span = document.createElement('span')
  span.textContent = s
  return span
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}
