// ドキュメント内の検索・置換。一致箇所をハイライトし、前後に移動、1 件／すべて置換できる。
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const findKey = new PluginKey('findReplace')

/**
 * 文書中の一致箇所を文書順に返す。段落などテキストブロックの中だけを探し、ブロックをまたいでは一致させない。
 * 太字などの装飾の境目はまたいで一致する。
 */
export function findMatches(doc, query, { caseSensitive = false } = {}) {
  if (!query) return []
  const results = []
  const needle = caseSensitive ? query : query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const map = [] // text の各文字 → 文書中の位置
    node.forEach((child, offset) => {
      const start = pos + 1 + offset
      if (child.isText) {
        for (let i = 0; i < child.text.length; i++) map.push(start + i)
        text += child.text
      } else {
        map.push(start)
        text += '￼' // 改行など。ここをまたいでは一致させない
      }
    })
    const lowered = caseSensitive ? text : text.toLowerCase()
    // 小文字化で長さが変わる文字を含む場合は、位置がずれるので大文字小文字を区別して探す
    const haystack = lowered.length === text.length ? lowered : text
    const target = lowered.length === text.length ? needle : query
    let from = haystack.indexOf(target)
    while (from !== -1) {
      const last = from + target.length - 1
      results.push({ from: map[from], to: map[last] + 1 })
      from = haystack.indexOf(target, from + Math.max(1, target.length))
    }
    return false
  })
  return results
}

const emptyState = { query: '', caseSensitive: false, matches: [], current: -1 }

function recompute(doc, prev, patch) {
  const next = { ...prev, ...patch }
  const matches = findMatches(doc, next.query, next)
  let current = next.current
  if (matches.length === 0) current = -1
  else if (current < 0 || current >= matches.length) current = 0
  return { ...next, matches, current }
}

export const FindReplace = Extension.create({
  name: 'findReplace',

  addCommands() {
    const update = (patch) => ({ tr, dispatch }) => {
      if (dispatch) tr.setMeta(findKey, patch)
      return true
    }
    return {
      setFindQuery: (query, options = {}) => update({ query, current: 0, ...options }),
      clearFind: () => update({ query: '', current: -1 }),
      findNext: (direction = 1) => ({ state, tr, dispatch }) => {
        const s = findKey.getState(state)
        if (!s.matches.length) return false
        const current = (s.current + direction + s.matches.length) % s.matches.length
        if (dispatch) tr.setMeta(findKey, { current })
        return true
      },
      replaceCurrent: (replacement) => ({ state, tr, dispatch }) => {
        const s = findKey.getState(state)
        const match = s.matches[s.current]
        if (!match) return false
        if (dispatch) {
          if (replacement) tr.insertText(replacement, match.from, match.to)
          else tr.delete(match.from, match.to)
          tr.setMeta(findKey, { current: s.current }) // 置換後は同じ番号＝次の一致へ
        }
        return true
      },
      replaceAll: (replacement) => ({ state, tr, dispatch }) => {
        const s = findKey.getState(state)
        if (!s.matches.length) return false
        if (dispatch) {
          // 後ろから置換すれば、前の一致の位置がずれない
          for (const match of [...s.matches].reverse()) {
            if (replacement) tr.insertText(replacement, match.from, match.to)
            else tr.delete(match.from, match.to)
          }
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findKey,
        state: {
          init: () => emptyState,
          apply(tr, prev) {
            const patch = tr.getMeta(findKey)
            if (patch) return recompute(tr.doc, prev, patch)
            if (tr.docChanged && prev.query) return recompute(tr.doc, prev, {})
            return prev
          },
        },
        props: {
          decorations(state) {
            const { matches, current } = findKey.getState(state)
            if (!matches.length) return DecorationSet.empty
            return DecorationSet.create(
              state.doc,
              matches.map((m, i) =>
                Decoration.inline(m.from, m.to, { class: i === current ? 'find-match is-current' : 'find-match' }),
              ),
            )
          },
        },
      }),
    ]
  },
})

/** 現在の一致箇所を選択し、画面内に見えるようにする（エディターにフォーカスは移さない）。 */
export function revealCurrentMatch(editor) {
  const { matches, current } = findKey.getState(editor.state)
  const match = matches[current]
  if (!match) return
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
  editor.view.dispatch(tr)
  const { node } = editor.view.domAtPos(match.from)
  const el = node instanceof Element ? node : node.parentElement
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
