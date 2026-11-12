// コールアウト。GitHub の Alerts 記法（> [!NOTE] など）の引用ブロックを、色付きの箱として表示する。
// 文書の中身は普通の引用のまま（見た目だけ変える）なので、Markdown の往復で崩れない。
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const CALLOUT_TYPES = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
}

const MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i

/** 引用ブロックの先頭テキストがコールアウトの印なら、種類と印の長さを返す。 */
export function detectCallout(text) {
  const m = MARKER_RE.exec(text)
  return m ? { type: m[1].toUpperCase(), length: m[0].length } : null
}

/**
 * Markdown 出力では「[」がエスケープされて「> \[!NOTE\]」になり、GitHub などで認識されなくなる。
 * 引用行の先頭にある、印だけの行を元に戻す。
 */
export function unescapeCalloutMarkers(markdown) {
  return markdown.replace(
    // 印の直後の強制改行（行末の空白 2 つや \）も取り除き、印だけの行にする
    /^((?:> ?)+)\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]( {2,}|\\)?$/gim,
    (_all, quote, type) => `${quote}[!${type}]`,
  )
}

function buildDecorations(doc) {
  const decorations = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote') return true
    const first = node.firstChild
    if (first?.isTextblock) {
      const found = detectCallout(first.textContent)
      if (found) {
        const type = found.type.toLowerCase()
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: `callout callout-${type}` }))
        const textStart = pos + 2 // blockquote 開始 + 段落開始
        decorations.push(
          Decoration.inline(textStart, textStart + found.length, {
            class: 'callout-marker',
            'data-label': CALLOUT_TYPES[found.type],
          }),
        )
      }
    }
    return true
  })
  return DecorationSet.create(doc, decorations)
}

export const Callout = Extension.create({
  name: 'callout',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('callout'),
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
