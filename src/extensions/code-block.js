// コードブロック: 言語ごとの色分け、言語の切り替え、mermaid の図のプレビュー。
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { THEME_CHANGE_EVENT, currentTheme } from '../theme.js'

export const lowlight = createLowlight(common)

export const LANGUAGES = [
  ['', 'テキスト'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['json', 'JSON'],
  ['bash', 'Shell'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['go', 'Go'],
  ['java', 'Java'],
  ['kotlin', 'Kotlin'],
  ['swift', 'Swift'],
  ['rust', 'Rust'],
  ['php', 'PHP'],
  ['sql', 'SQL'],
  ['yaml', 'YAML'],
  ['xml', 'HTML / XML'],
  ['css', 'CSS'],
  ['markdown', 'Markdown'],
  ['diff', 'Diff'],
  ['mermaid', 'Mermaid（図）'],
]

// mermaid は大きい（数 MB）ので、図を初めて描くときにだけ読み込む
let mermaidPromise = null
let renderSeq = 0
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => mermaid)
  return mermaidPromise.then((mermaid) => {
    // テーマは描くたびに合わせる（途中でダーク／ライトを切り替えても追従する）
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: currentTheme() === 'dark' ? 'dark' : 'default' })
    return mermaid
  })
}

async function renderMermaid(target, source) {
  const seq = ++renderSeq
  if (!source.trim()) {
    target.textContent = '図の定義を書くと、ここに表示されます'
    target.classList.add('is-empty')
    return
  }
  try {
    const mermaid = await loadMermaid()
    const { svg } = await mermaid.render(`mermaid-${seq}`, source)
    target.classList.remove('is-empty', 'is-error')
    target.innerHTML = svg // securityLevel: 'strict' で mermaid 側がサニタイズ済み
  } catch (err) {
    target.classList.add('is-error')
    target.textContent = `図を描けませんでした: ${String(err?.message ?? err).split('\n')[0]}`
    document.getElementById(`dmermaid-${seq}`)?.remove() // 失敗時に mermaid が body に残す要素
  }
}

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      let renderTimer = null

      const dom = document.createElement('div')
      dom.className = 'code-block'

      const header = document.createElement('div')
      header.className = 'code-block-header'
      header.contentEditable = 'false'
      const select = document.createElement('select')
      select.className = 'code-block-lang'
      select.setAttribute('aria-label', 'コードの言語')
      header.append(select)

      const pre = document.createElement('pre')
      const code = document.createElement('code')
      pre.append(code)

      const preview = document.createElement('div')
      preview.className = 'mermaid-preview'
      preview.contentEditable = 'false'

      dom.append(header, pre, preview)

      select.addEventListener('change', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        const language = select.value || null
        editor.chain().command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, language })
          return true
        }).run()
      })

      function syncLanguage() {
        const lang = current.attrs.language ?? ''
        if (![...select.options].some((o) => o.value === lang)) {
          select.innerHTML = ''
          const options = LANGUAGES.some(([v]) => v === lang) || !lang ? LANGUAGES : [...LANGUAGES, [lang, lang]]
          for (const [value, label] of options) select.append(new Option(label, value))
        }
        select.value = lang
        code.className = lang ? `language-${lang}` : ''
        const isMermaid = lang === 'mermaid'
        preview.hidden = !isMermaid
        dom.classList.toggle('is-mermaid', isMermaid)
        if (isMermaid) {
          clearTimeout(renderTimer)
          renderTimer = setTimeout(() => renderMermaid(preview, current.textContent), 300)
        }
      }
      for (const [value, label] of LANGUAGES) select.append(new Option(label, value))
      syncLanguage()

      const onThemeChange = () => {
        if (current.attrs.language === 'mermaid') renderMermaid(preview, current.textContent)
      }
      window.addEventListener(THEME_CHANGE_EVENT, onThemeChange)

      return {
        dom,
        contentDOM: code,
        update(updated) {
          if (updated.type !== current.type) return false
          const changed = updated.attrs.language !== current.attrs.language || updated.textContent !== current.textContent
          current = updated
          if (changed) syncLanguage()
          return true
        },
        // 言語の選択や図のプレビューは文書の外側。ProseMirror に再描画させない
        ignoreMutation: (m) => m.type !== 'selection' && !code.contains(m.target),
        stopEvent: (e) => header.contains(e.target) || preview.contains(e.target),
        destroy() {
          clearTimeout(renderTimer)
          window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
        },
      }
    }
  },
}).configure({ lowlight, defaultLanguage: null })
