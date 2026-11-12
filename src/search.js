// ドキュメント横断の検索。サイドバーの検索欄と Ctrl+K のクイックスイッチャーで共有する。
import { deriveTitle } from './store.js'

const SNIPPET_RADIUS = 24

/**
 * 空白区切りの語をすべて含むドキュメントを返す（大文字小文字は区別しない）。
 * タイトルに一致したものを先に、同じ扱いなら更新が新しい順。
 * 本文の一致は前後を切り出した snippet を付ける。
 */
export function searchDocs(docs, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const all = Object.values(docs).map((doc) => ({ doc, title: deriveTitle(doc.content) }))
  if (terms.length === 0) {
    return all.sort((a, b) => b.doc.updatedAt - a.doc.updatedAt).map(({ doc, title }) => result(doc, title, null))
  }
  const hits = []
  for (const { doc, title } of all) {
    const lowerTitle = title.toLowerCase()
    const lowerBody = doc.content.toLowerCase()
    if (!terms.every((t) => lowerTitle.includes(t) || lowerBody.includes(t))) continue
    const titleHit = terms.every((t) => lowerTitle.includes(t))
    const bodyTerm = terms.find((t) => !lowerTitle.includes(t)) ?? terms[0]
    hits.push({ ...result(doc, title, titleHit ? null : makeSnippet(doc.content, bodyTerm)), titleHit })
  }
  return hits
    .sort((a, b) => Number(b.titleHit) - Number(a.titleHit) || b.updatedAt - a.updatedAt)
    .map(({ titleHit: _t, ...rest }) => rest)
}

function result(doc, title, snippet) {
  return { id: doc.id, title, updatedAt: doc.updatedAt, snippet }
}

/** 本文中で term が最初に現れる行の前後を切り出す。{ before, match, after } で返し、表示側で強調する。 */
export function makeSnippet(content, term) {
  const index = content.toLowerCase().indexOf(term)
  if (index === -1) return null
  const lineStart = content.lastIndexOf('\n', index) + 1
  const lineEndRaw = content.indexOf('\n', index)
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw
  const start = Math.max(lineStart, index - SNIPPET_RADIUS)
  const end = Math.min(lineEnd, index + term.length + SNIPPET_RADIUS)
  const clean = (s) => s.replace(/^[#>\-*+|\s]+/, '').replace(/[*_`]/g, '')
  return {
    before: (start > lineStart ? '…' : '') + clean(content.slice(start, index)),
    match: content.slice(index, index + term.length),
    after: content.slice(index + term.length, end).replace(/[*_`]/g, '') + (end < lineEnd ? '…' : ''),
  }
}
