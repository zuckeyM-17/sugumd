import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor.js'
import { extractHeadings, looksLikeMarkdown, parseTableSize } from '../src/markdown-utils.js'
import { filterCommands, insertTable } from '../src/slash-command.js'
import { appendColumn, appendRow, findTableAt } from '../src/table-controls.js'

let editor
afterEach(() => editor?.destroy())

function make(markdown) {
  editor = createEditor({ element: document.createElement('div'), markdown })
  return editor
}

function tableShape(ed) {
  const shapes = []
  ed.state.doc.descendants((node) => {
    if (node.type.name !== 'table') return true
    shapes.push({ rows: node.childCount, cols: node.firstChild.childCount })
    return false
  })
  return shapes
}

describe('Markdown の読み書き', () => {
  it('見出し・リスト・ToDo・表・コードが往復しても崩れない', () => {
    const md = [
      '# タイトル',
      '',
      '- りんご',
      '- みかん',
      '',
      '- [ ] やること',
      '- [x] 済んだこと',
      '',
      '| 名前 | 値 |',
      '| --- | --- |',
      '| a | 1 |',
      '',
      '```js',
      'const x = 1',
      '```',
    ].join('\n')
    const out = make(md).getMarkdown()
    expect(out).toContain('# タイトル')
    expect(out).toContain('- りんご')
    expect(out).toMatch(/- \[ \] やること/)
    expect(out).toMatch(/- \[x\] 済んだこと/)
    expect(out).toMatch(/\|\s*名前\s*\|\s*値\s*\|/)
    expect(out).toContain('const x = 1')
    // 2 回目の往復で変化しない（保存のたびに内容が揺れない）
    expect(make(out).getMarkdown()).toBe(out)
  })
})

describe('目次', () => {
  it('見出しを文書順にレベル付きで取り出す', () => {
    const headings = extractHeadings(make('# A\n\ntext\n\n## B\n\n### C\n\n## \n').state.doc)
    expect(headings.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: 'A' },
      { level: 2, text: 'B' },
      { level: 3, text: 'C' },
    ])
  })

  it('見出しがなければ空', () => {
    expect(extractHeadings(make('本文だけ').state.doc)).toEqual([])
  })
})

describe('表の作成', () => {
  it.each([
    ['3x4', { rows: 3, cols: 4 }],
    ['表2×5', { rows: 2, cols: 5 }],
    ['table 10*3', { rows: 10, cols: 3 }],
  ])('サイズ指定 %s を読める', (q, size) => {
    expect(parseTableSize(q)).toEqual(size)
  })

  it.each(['', 'x', '0x3', '3x0', '99x3', '3x', 'abc'])('サイズでない %j は null', (q) => {
    expect(parseTableSize(q)).toBeNull()
  })

  it('/3x4 は即時挿入項目だけを出す', () => {
    const items = filterCommands('3x4')
    expect(items).toHaveLength(1)
    expect(items[0].size).toEqual({ rows: 3, cols: 4 })
  })

  it('表の中では表コマンドを出さない（入れ子の表は Markdown で消えるため）', () => {
    expect(filterCommands('3x4', { inTable: true })).toEqual([])
    expect(filterCommands('', { inTable: true }).map((c) => c.id)).not.toContain('table')
    expect(filterCommands('', { inTable: true }).map((c) => c.id)).toContain('h1')
  })

  it('キーワードで絞り込める（英語・日本語）', () => {
    expect(filterCommands('table').map((c) => c.id)).toContain('table')
    expect(filterCommands('見出し').map((c) => c.id)).toEqual(['h1', 'h2', 'h3'])
    expect(filterCommands('存在しない')).toEqual([])
  })

  it('指定サイズの表（1 行目は見出し行）を挿入し、Markdown の表になる', () => {
    const ed = make('')
    insertTable(ed, { rows: 3, cols: 4 })
    expect(tableShape(ed)).toEqual([{ rows: 3, cols: 4 }])
    const lines = ed.getMarkdown().split('\n').filter((l) => l.startsWith('|'))
    expect(lines).toHaveLength(4) // 見出し行 + 区切り行 + 本文 2 行
  })

  it('「+」で末尾に行・列を足せる', () => {
    const ed = make('| a | b |\n| --- | --- |\n| 1 | 2 |\n\n後ろの段落')
    const tablePos = findTableAt(ed.state.doc, 3).pos
    appendRow(ed, tablePos)
    expect(tableShape(ed)).toEqual([{ rows: 3, cols: 2 }])
    appendColumn(ed, tablePos)
    expect(tableShape(ed)).toEqual([{ rows: 3, cols: 3 }])
    // 既存の中身は残る
    expect(ed.getMarkdown()).toMatch(/\|\s*1\s*\|\s*2\s*\|/)
  })

  it('表の外の位置では表を見つけない', () => {
    const ed = make('段落\n\n| a |\n| --- |\n| 1 |')
    expect(findTableAt(ed.state.doc, 1)).toBeNull()
  })
})

describe('貼り付けの Markdown 判定', () => {
  it.each(['# 見出し', '- a\n- b', '1. a', '| a | b |', '**太字**', '[x](https://x.y)', '```\ncode\n```'])(
    'Markdown とみなす: %j',
    (t) => expect(looksLikeMarkdown(t)).toBe(true),
  )
  it.each(['普通の文章です。', 'メール: a@b.c', '#ハッシュタグ', '3 - 2 = 1'])('普通のテキスト: %j', (t) =>
    expect(looksLikeMarkdown(t)).toBe(false),
  )
})
