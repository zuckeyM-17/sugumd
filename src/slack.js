// Markdown を Slack の書式（mrkdwn）に変換する。
//   **太字** → *太字*   *斜体* → _斜体_   ~~取消~~ → ~取消~   [文字](URL) → <URL|文字>
//   # 見出し → *見出し*   - 項目 → • 項目   - [ ] → ☐   - [x] → ☑
//   表 → コードブロック（Slack は表を表示できないため、等幅で崩れないようにする）
import { CALLOUT_TYPES } from './extensions/callout.js'

const FENCE_RE = /^(\s*)(```|~~~)/

export function toSlackMrkdwn(markdown) {
  const out = []
  const lines = markdown.split('\n')
  let fence = null
  let table = []

  const flushTable = () => {
    if (table.length === 0) return
    out.push('```', ...table, '```')
    table = []
  }

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line)
    if (fence) {
      out.push(line)
      if (fenceMatch && fenceMatch[2] === fence) fence = null
      continue
    }
    if (fenceMatch) {
      flushTable()
      fence = fenceMatch[2]
      out.push(`${fenceMatch[1]}\`\`\``) // 言語名は Slack では使えないので落とす
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      table.push(line.trim())
      continue
    }
    flushTable()
    const converted = convertLine(line)
    if (converted != null) out.push(converted)
  }
  flushTable()
  if (fence) out.push('```')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function convertLine(line) {
  // トグル: <details> の枠は消し、見出しを太字にする
  if (/^\s*<\/?details(\s[^>]*)?>\s*$/i.test(line)) return null
  const summary = /^\s*<summary>(.*)<\/summary>\s*$/i.exec(line)
  if (summary) return `*${stripEmphasis(inline(summary[1]))}*`

  const heading = /^#{1,6}\s+(.*)$/.exec(line)
  if (heading) return `*${stripEmphasis(inline(heading[1]))}*`

  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return '──────────'

  const quote = /^((?:>\s?)+)(.*)$/.exec(line)
  if (quote) {
    const marker = /^\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]\s*$/i.exec(quote[2])
    if (marker) return `> *${CALLOUT_TYPES[marker[1].toUpperCase()]}*`
    return `> ${listItem(quote[2])}`
  }
  return listItem(line)
}

function listItem(line) {
  const task = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line)
  if (task) return `${task[1]}${task[2] === ' ' ? '☐' : '☑'} ${inline(task[3])}`
  const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line)
  if (bullet) return `${bullet[1]}• ${inline(bullet[2])}`
  return inline(line)
}

/** 行内の書式を変換する。コードと Markdown のエスケープは中身を変えないよう先に退避する。 */
export function inline(text) {
  const stash = []
  const keep = (s) => `\u0000${stash.push(s) - 1}\u0000`
  let s = text
    .replace(/`[^`]+`/g, (m) => keep(m))
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_m, c) => keep(c))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => keep(`<${url}|${label}>`))
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, (_m, _d, body) => `\u0001${body}\u0001`)
    .replace(/(^|[^\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])/g, '$1_$2_')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '~$1~')
    .replace(/\u0001/g, '*')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => stash[Number(i)])
}

function stripEmphasis(text) {
  // 見出しは全体を * で囲むので、中の太字の * は外す（入れ子にすると Slack で崩れる）
  return text.replace(/\*([^*]+)\*/g, '$1')
}
