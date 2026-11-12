// Tiptap エディターの組み立て。拡張の構成をアプリとテストで共有する。
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { looksLikeMarkdown } from './markdown-utils.js'

export function buildExtensions({ withSlashCommand } = {}) {
  const extensions = [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === 'heading' ? '見出し' : '「/」でコマンド。# で見出し、- で箇条書き、/3x4 で表',
    }),
    Markdown,
  ]
  if (withSlashCommand) extensions.push(withSlashCommand)
  return extensions
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
  return editor
}
