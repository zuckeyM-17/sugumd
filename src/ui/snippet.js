// 検索結果の本文抜粋を、一致部分を <mark> で強調して描く（textContent だけを使い HTML は解釈しない）。
export function renderSnippet(snippet, className) {
  const el = document.createElement('div')
  el.className = className
  const mark = document.createElement('mark')
  mark.textContent = snippet.match
  el.append(document.createTextNode(snippet.before), mark, document.createTextNode(snippet.after))
  return el
}
