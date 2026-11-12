// 全ドキュメントの ToDo（- [ ] / - [x]）を集める・切り替える。Markdown の行を直接扱う純粋関数。
import { deriveTitle } from './store.js'

const TASK_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/
const FENCE_RE = /^\s*(```|~~~)/

/** Markdown から ToDo を取り出す。line は 0 始まりの行番号。コードブロックの中は無視する。 */
export function extractTodos(markdown) {
  const todos = []
  let inFence = false
  markdown.split('\n').forEach((text, line) => {
    if (FENCE_RE.test(text)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const m = TASK_RE.exec(text)
    if (m) todos.push({ line, depth: Math.floor(m[1].length / 2), checked: m[3] !== ' ', text: plainText(m[4]) })
  })
  return todos
}

/** 一覧に出すための、Markdown の装飾を落とした文字列。 */
function plainText(md) {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
    .trim()
}

/**
 * line 行目の ToDo のチェック状態を変えた Markdown を返す。
 * その行がもう ToDo でない（別の場所で書き換えられた）場合は null。
 */
export function setTodoChecked(markdown, line, checked) {
  const lines = markdown.split('\n')
  const m = TASK_RE.exec(lines[line] ?? '')
  if (!m) return null
  lines[line] = lines[line].replace(/\[([ xX])\]/, checked ? '[x]' : '[ ]')
  return lines.join('\n')
}

/**
 * ドキュメントごとに ToDo をまとめる。未完了が多い順ではなく、更新が新しいドキュメント順。
 * includeDone: false なら完了済みを除き、ToDo が残らないドキュメントは出さない。
 */
export function collectTodos(docs, { includeDone = false } = {}) {
  return Object.values(docs)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((doc) => {
      const todos = extractTodos(doc.content).filter((t) => includeDone || !t.checked)
      return { id: doc.id, title: deriveTitle(doc.content), todos }
    })
    .filter((group) => group.todos.length > 0)
}

export function countOpenTodos(docs) {
  return Object.values(docs).reduce((n, doc) => n + extractTodos(doc.content).filter((t) => !t.checked).length, 0)
}
