import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor.js'

let editor
afterEach(() => editor?.destroy())

// ブラウザでの文字入力と同じ経路（handleTextInput → 入力ルール）で 1 文字ずつ打つ
function type(ed, text) {
  for (const ch of text) {
    const { from, to } = ed.state.selection
    const handled = ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, ch, () => ed.state.tr.insertText(ch, from, to)))
    if (!handled) ed.view.dispatch(ed.state.tr.insertText(ch, from, to))
  }
}
const md = () => editor.getMarkdown().trim()

function start(markdown = '') {
  editor = createEditor({ element: document.createElement('div'), markdown })
  editor.commands.focus('end')
  return editor
}

describe('「- [ ] 」で ToDo を作る', () => {
  it.each([
    ['- [ ] a', '- [ ] a'],
    ['- [x] done', '- [x] done'],
    ['* [ ] a', '- [ ] a'],
    ['- [] a', '- [ ] a'],
    ['[ ] a', '- [ ] a'],
  ])('%j と打つと %j', (input, expected) => {
    type(start(), input)
    expect(md()).toBe(expected)
  })

  it('既存の箇条書きの途中では、その項目だけが ToDo になる', () => {
    const ed = start('- one\n- two\n- three')
    // 「two」の先頭へ
    let twoPos = null
    ed.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'two') twoPos = pos
    })
    ed.commands.setTextSelection(twoPos)
    type(ed, '[ ] ')
    expect(md()).toBe('- one\n\n- [ ] two\n\n- three')
  })

  it('箇条書きの先頭以外では変換しない', () => {
    type(start(), '- a [ ] b')
    expect(JSON.stringify(editor.getJSON())).not.toContain('taskList')
    expect(editor.state.doc.textContent).toBe('a [ ] b')
  })
})
