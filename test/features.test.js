import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, serializeRange } from '../src/editor.js'
import { detectCallout, unescapeCalloutMarkers } from '../src/extensions/callout.js'
import { scanDetails } from '../src/extensions/details.js'
import { findKey, findMatches } from '../src/extensions/find-replace.js'
import { extractHeadings, sectionRange } from '../src/markdown-utils.js'
import { makeSnippet, searchDocs } from '../src/search.js'
import { COMMANDS, filterCommands } from '../src/slash-command.js'

let editor
afterEach(() => editor?.destroy())
function make(markdown) {
  editor = createEditor({ element: document.createElement('div'), markdown })
  return editor
}
const roundTrip = (md) => make(md).getMarkdown()

describe('トグル（<details>）', () => {
  const md = '<details>\n<summary>開く **太字**</summary>\n\n中身\n\n- a\n\n</details>'

  it('Markdown を往復しても崩れない', () => {
    expect(roundTrip(md)).toBe(md)
    const ed = make(md)
    const details = ed.getJSON().content[0]
    expect(details.type).toBe('details')
    expect(details.content.map((n) => n.type)).toEqual(['detailsSummary', 'detailsContent'])
  })

  it('open 属性を保つ', () => {
    expect(roundTrip('<details open>\n<summary>A</summary>\n\nB\n\n</details>')).toContain('<details open>')
  })

  it('入れ子のトグルを正しく切り出す', () => {
    const nested = '<details>\n<summary>外</summary>\n\n<details>\n<summary>内</summary>\n\nx\n\n</details>\n\n</details>\n\n後ろ'
    const found = scanDetails(nested)
    expect(found.summary).toBe('外')
    expect(found.body).toContain('<summary>内</summary>')
    expect(nested.slice(found.raw.length).trim()).toBe('後ろ')
    expect(roundTrip(nested)).toBe(nested)
  })

  it('閉じタグがなければトグルとして扱わない', () => {
    expect(scanDetails('<details>\n<summary>A</summary>\n\n本文')).toBeNull()
  })

  it('HTML としてコピーすると <details><summary> になる（Notion のトグルになる）', () => {
    const html = make(md).getHTML()
    expect(html).toMatch(/<details[^>]*>.*<summary[^>]*>/)
  })
})

describe('コールアウト', () => {
  it.each([
    ['[!NOTE]', 'NOTE'],
    ['[!warning] 小文字', 'WARNING'],
    ['[!FOO]', null],
    ['NOTE', null],
  ])('%j → %s', (text, type) => {
    expect(detectCallout(text)?.type ?? null).toBe(type)
  })

  it('印がエスケープされず、GitHub の記法のまま往復する', () => {
    const md = '> [!WARNING]\n> 消すと戻せません'
    expect(roundTrip(md)).toBe(md)
  })

  it('印の直後の強制改行を取り除く（ブラウザで編集すると改行が強制改行になることがある）', () => {
    expect(unescapeCalloutMarkers('> \\[!NOTE\\]  \n> 本文')).toBe('> [!NOTE]\n> 本文')
    expect(unescapeCalloutMarkers('> \\[!NOTE\\]\\\n> 本文')).toBe('> [!NOTE]\n> 本文')
  })

  it('引用の先頭以外の [!NOTE] は触らない', () => {
    expect(unescapeCalloutMarkers('本文 \\[!NOTE\\]')).toBe('本文 \\[!NOTE\\]')
    expect(unescapeCalloutMarkers('> > \\[!TIP\\]')).toBe('> > [!TIP]')
  })

  it('スラッシュコマンドで GitHub と同じ形のコールアウトを作れる', () => {
    const ed = make('')
    const tip = COMMANDS.find((c) => c.id === 'callout-tip')
    tip.run(ed.chain().focus()).run()
    ed.commands.insertContent('ヒントの本文')
    expect(ed.getMarkdown().trimEnd()).toBe('> [!TIP]\n>\n> ヒントの本文')
  })
})

describe('コードブロック / Mermaid', () => {
  it('言語指定を保って往復する', () => {
    const md = '```ruby\nputs "hi"\n```'
    expect(roundTrip(md)).toBe(md)
  })

  it('mermaid のコードブロックはそのまま残る', () => {
    const md = '```mermaid\nflowchart LR\n  A --> B\n```'
    expect(roundTrip(md)).toBe(md)
  })

  it('スラッシュコマンドで Mermaid の雛形を入れられる', () => {
    const ed = make('')
    COMMANDS.find((c) => c.id === 'mermaid').run(ed.chain().focus()).run()
    expect(ed.getMarkdown()).toMatch(/^```mermaid\nflowchart LR\n/)
  })

  it('トグル・コールアウト・Mermaid をスラッシュで探せる', () => {
    expect(filterCommands('toggle').map((c) => c.id)).toEqual(['toggle'])
    expect(filterCommands('図').map((c) => c.id)).toEqual(['mermaid'])
    expect(filterCommands('callout')).toHaveLength(5)
  })
})

describe('ドキュメント横断検索', () => {
  const docs = {
    a: { id: 'a', content: '# 議事録\n\n予算の話をした', createdAt: 1, updatedAt: 10 },
    b: { id: 'b', content: '# 予算案\n\n来期の数字', createdAt: 1, updatedAt: 5 },
    c: { id: 'c', content: '# 雑記\n\nNotion に貼る', createdAt: 1, updatedAt: 20 },
  }

  it('タイトル一致を先に、本文一致を後に返す', () => {
    expect(searchDocs(docs, '予算').map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('本文一致には抜粋を付ける', () => {
    const [hit] = searchDocs(docs, '話')
    expect(hit.snippet).toEqual({ before: '予算の', match: '話', after: 'をした' })
  })

  it('複数語は AND、大文字小文字は区別しない', () => {
    expect(searchDocs(docs, 'notion 貼る').map((r) => r.id)).toEqual(['c'])
    expect(searchDocs(docs, '予算 存在しない')).toEqual([])
  })

  it('空の検索語なら更新が新しい順に全件', () => {
    expect(searchDocs(docs, '  ').map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('長い行は前後を省略する', () => {
    const s = makeSnippet('あ'.repeat(50) + '目印' + 'い'.repeat(50), '目印')
    expect(s.before.startsWith('…')).toBe(true)
    expect(s.after.endsWith('…')).toBe(true)
    expect(s.match).toBe('目印')
  })
})

describe('ドキュメント内の検索・置換', () => {
  it('装飾の境目をまたいで見つけ、大文字小文字の区別を切り替えられる', () => {
    const ed = make('Hello **wor**ld\n\nhello again')
    const texts = (opts) => findMatches(ed.state.doc, 'hello', opts).map((m) => ed.state.doc.textBetween(m.from, m.to))
    expect(texts()).toEqual(['Hello', 'hello'])
    expect(texts({ caseSensitive: true })).toEqual(['hello'])
    expect(findMatches(ed.state.doc, 'world').length).toBe(1)
  })

  it('段落をまたいでは一致しない', () => {
    const ed = make('ab\n\ncd')
    expect(findMatches(ed.state.doc, 'bc')).toEqual([])
  })

  it('次へ・置換・すべて置換', () => {
    const ed = make('りんご と りんご と りんご')
    ed.commands.setFindQuery('りんご')
    expect(findKey.getState(ed.state).matches).toHaveLength(3)
    ed.commands.findNext(1)
    expect(findKey.getState(ed.state).current).toBe(1)
    ed.commands.replaceCurrent('みかん')
    expect(ed.getMarkdown()).toBe('りんご と みかん と りんご')
    expect(findKey.getState(ed.state).matches).toHaveLength(2)
    ed.commands.replaceAll('ぶどう')
    expect(ed.getMarkdown()).toBe('ぶどう と みかん と ぶどう')
    ed.commands.clearFind()
    expect(findKey.getState(ed.state).matches).toEqual([])
  })

  it('一致がなければ置換しない', () => {
    const ed = make('abc')
    ed.commands.setFindQuery('zzz')
    expect(ed.commands.replaceAll('x')).toBe(false)
    expect(ed.getMarkdown()).toBe('abc')
  })
})

describe('見出し単位のコピー', () => {
  const md = '# A\n\na本文\n\n## A-1\n\nサブ\n\n## A-2\n\n> [!NOTE]\n> 注\n\n# B\n\nb本文'
  const copyOf = (text) => {
    const ed = make(md)
    const h = extractHeadings(ed.state.doc).find((x) => x.text === text)
    const range = sectionRange(ed.state.doc, h.pos)
    return serializeRange(ed, range.from, range.to)
  }

  it('次の同じかより上位の見出しの手前まで', () => {
    expect(copyOf('A-1').markdown).toBe('## A-1\n\nサブ')
    expect(copyOf('A').markdown).toContain('## A-2')
    expect(copyOf('A').markdown).not.toContain('# B')
  })

  it('最後の節は文書の終わりまで', () => {
    expect(copyOf('B').markdown).toBe('# B\n\nb本文')
  })

  it('コールアウトの印を保ち、HTML も作る', () => {
    const { markdown, html } = copyOf('A-2')
    expect(markdown).toContain('> [!NOTE]')
    expect(html).toMatch(/^<h2>A-2<\/h2>/)
  })
})
