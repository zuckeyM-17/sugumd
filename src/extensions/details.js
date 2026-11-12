// トグル（折りたたみ）ブロック。Markdown では GitHub と同じ <details> 記法で読み書きする:
//
//   <details>
//   <summary>見出し</summary>
//
//   中身（Markdown）
//
//   </details>
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'

const OPEN_RE = /^<details(\s+open(?:=(?:""|"open"))?)?\s*>[ \t]*\n?/i
const SUMMARY_RE = /^\s*<summary>([\s\S]*?)<\/summary>[ \t]*\n?/i
const TAG_RE = /<(\/?)details\b[^>]*>/gi

/**
 * src の先頭にある <details>…</details> を、入れ子を数えて切り出す。
 * 閉じタグがなければ null（普通の HTML として扱わせる）。
 */
export function scanDetails(src) {
  const open = OPEN_RE.exec(src)
  if (!open) return null
  TAG_RE.lastIndex = 0
  let depth = 0
  let m
  while ((m = TAG_RE.exec(src))) {
    depth += m[1] ? -1 : 1
    if (depth === 0) {
      const end = m.index + m[0].length
      const trailing = /^[ \t]*(?:\n|$)/.exec(src.slice(end))
      const raw = src.slice(0, end + (trailing ? trailing[0].length : 0))
      let inner = src.slice(open[0].length, m.index)
      const summary = SUMMARY_RE.exec(inner)
      if (summary) inner = inner.slice(summary[0].length)
      return { raw, open: Boolean(open[1]), summary: summary ? summary[1].trim() : '', body: inner.trim() }
    }
  }
  return null
}

export const MarkdownDetails = Details.extend({
  markdownTokenName: 'details',
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: (src) => src.search(/<details[\s>]/i),
    tokenize(src, _tokens, lexer) {
      const found = scanDetails(src)
      if (!found) return undefined
      return {
        type: 'details',
        raw: found.raw,
        open: found.open,
        summaryTokens: lexer.inlineTokens(found.summary),
        tokens: found.body ? lexer.blockTokens(found.body) : [],
      }
    },
  },
  parseMarkdown(token, h) {
    const summary = h.createNode('detailsSummary', {}, h.parseInline(token.summaryTokens ?? []))
    const children = h.parseChildren(token.tokens ?? [])
    const content = h.createNode('detailsContent', {}, children.length ? children : [h.createNode('paragraph')])
    return h.createNode('details', { open: token.open }, [summary, content])
  },
  renderMarkdown(node, h) {
    const [summary, content] = node.content ?? []
    const summaryMd = summary?.content ? h.renderChildren(summary.content) : ''
    const body = content?.content ? h.renderChildren(content.content, '\n\n').trim() : ''
    const openAttr = node.attrs?.open ? ' open' : ''
    return `<details${openAttr}>\n<summary>${summaryMd}</summary>\n\n${body}\n\n</details>`
  },
}).configure({ persist: true, HTMLAttributes: { class: 'toggle' } })

export const MarkdownDetailsSummary = DetailsSummary
export const MarkdownDetailsContent = DetailsContent
