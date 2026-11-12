// Tiptap エディターの組み立て。拡張の構成をアプリとテストで共有する。
import { Editor, getHTMLFromFragment } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { looksLikeMarkdown } from './markdown-utils.js'
import { CodeBlock } from './extensions/code-block.js'
import { Callout, unescapeCalloutMarkers } from './extensions/callout.js'
import { MarkdownDetails, MarkdownDetailsContent, MarkdownDetailsSummary } from './extensions/details.js'
import { FindReplace } from './extensions/find-replace.js'

export function buildExtensions({ withSlashCommand } = {}) {
  const extensions = [
    StarterKit.configure({
      // 文字を選んだ状態で URL を貼るとリンクにする（linkOnPaste）
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
      codeBlock: false, // 色分け付きの CodeBlock に置き換える
    }),
    CodeBlock,
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    MarkdownDetails,
    MarkdownDetailsSummary,
    MarkdownDetailsContent,
    Callout,
    FindReplace,
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return '見出し'
        if (node.type.name === 'detailsSummary') return 'トグルの見出し'
        return '「/」でコマンド。# で見出し、- で箇条書き、/3x4 で表'
      },
    }),
    Markdown,
  ]
  if (withSlashCommand) extensions.push(withSlashCommand)
  return extensions
}

/** 文書の一部（from〜to）を Markdown と HTML にする。目次からの節コピーで使う。 */
export function serializeRange(editor, from, to) {
  const fragment = editor.state.doc.slice(from, to).content
  const markdown = unescapeCalloutMarkers(editor.markdown.serialize({ type: 'doc', content: fragment.toJSON() }))
  return { markdown, html: getHTMLFromFragment(fragment, editor.schema) }
}

export function createEditor({ element, markdown = '', slashCommand, onUpdate } = {}) {
  const editor = new Editor({
    element,
    extensions: buildExtensions({ withSlashCommand: slashCommand }),
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'false' },
      // HTML を伴わないプレーンテキストが Markdown らしければ、Markdown として解釈して貼る
      handlePaste: (_view, event) => {
        const data = event.clipboardData
        if (!data || data.types.includes('text/html')) return false
        const text = data.getData('text/plain')
        if (!text || editor.isActive('codeBlock') || !looksLikeMarkdown(text)) return false
        editor.commands.insertContent(text, { contentType: 'markdown' })
        return true
      },
      // Ctrl/Cmd + クリックでリンクを新しいタブで開く
      handleClick: (_view, _pos, event) => {
        if (!(event.metaKey || event.ctrlKey)) return false
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null
        if (!link) return false
        window.open(link.href, '_blank', 'noopener')
        return true
      },
    },
    onUpdate: ({ editor }) => onUpdate?.(editor),
  })
  // コールアウトの印（> [!NOTE]）がエスケープされないよう、出力を整える
  const rawGetMarkdown = editor.getMarkdown.bind(editor)
  editor.getMarkdown = () => unescapeCalloutMarkers(rawGetMarkdown())
  return editor
}
