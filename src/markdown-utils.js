// エディター本体に依存しない、Markdown まわりの小さな判定関数。

/** ProseMirror の doc から見出しを文書順に取り出す。pos はその見出しノードの位置。空の見出しは除く。 */
export function extractHeadings(doc) {
  const headings = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim()
      if (text) headings.push({ level: node.attrs.level, text, pos })
      return false
    }
    return true
  })
  return headings
}

/**
 * スラッシュコマンドの検索語から表のサイズを読む。
 * "3x4" "3×4" "table3x4" "表3*4" などを「3行 × 4列」と解釈する。
 */
export const MAX_TABLE_ROWS = 50
export const MAX_TABLE_COLS = 20

export function parseTableSize(query) {
  const m = /^(?:table|tbl|表|テーブル|ひょう)?\s*(\d{1,2})\s*[x×*]\s*(\d{1,2})$/i.exec(query.trim())
  if (!m) return null
  const rows = Number(m[1])
  const cols = Number(m[2])
  if (rows < 1 || cols < 1 || rows > MAX_TABLE_ROWS || cols > MAX_TABLE_COLS) return null
  return { rows, cols }
}

/** プレーンテキストの貼り付けを Markdown として解釈すべきか。 */
export function looksLikeMarkdown(text) {
  const patterns = [
    /^#{1,6}\s+\S/m, // 見出し
    /^\s*[-*+]\s+\S/m, // 箇条書き
    /^\s*\d+\.\s+\S/m, // 番号付きリスト
    /^>\s?\S/m, // 引用
    /^```/m, // コードブロック
    /^\|.*\|\s*$/m, // 表
    /\*\*[^*\n]+\*\*/, // 太字
    /\[[^\]\n]+\]\([^)\s]+\)/, // リンク
  ]
  return patterns.some((p) => p.test(text))
}
