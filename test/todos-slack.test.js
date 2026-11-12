import { describe, expect, it } from 'vitest'
import { collectTodos, countOpenTodos, extractTodos, setTodoChecked } from '../src/todos.js'
import { inline, toSlackMrkdwn } from '../src/slack.js'

describe('ToDo の抽出', () => {
  const md = [
    '# 週報',
    '- [ ] **資料**を作る',
    '  - [x] 下書き',
    '- 普通の箇条書き',
    '```md',
    '- [ ] コードの中は ToDo ではない',
    '```',
    '* [X] [リンク](https://x.y)を確認',
  ].join('\n')

  it('行番号・深さ・完了状態・装飾を落とした文字を返す', () => {
    expect(extractTodos(md)).toEqual([
      { line: 1, depth: 0, checked: false, text: '資料を作る' },
      { line: 2, depth: 1, checked: true, text: '下書き' },
      { line: 7, depth: 0, checked: true, text: 'リンクを確認' },
    ])
  })

  it('チェックを付け外しすると、その行だけが変わる', () => {
    const done = setTodoChecked(md, 1, true)
    expect(done.split('\n')[1]).toBe('- [x] **資料**を作る')
    expect(done.split('\n').filter((l, i) => i !== 1)).toEqual(md.split('\n').filter((l, i) => i !== 1))
    expect(setTodoChecked(md, 7, false).split('\n')[7]).toBe('* [ ] [リンク](https://x.y)を確認')
  })

  it('その行がもう ToDo でなければ null（別の場所で書き換えられた）', () => {
    expect(setTodoChecked(md, 0, true)).toBeNull()
    expect(setTodoChecked(md, 99, true)).toBeNull()
  })

  it('ドキュメントごとにまとめ、既定では未完了だけ・未完了がないドキュメントは出さない', () => {
    const docs = {
      a: { id: 'a', content: '# A\n- [ ] a1\n- [x] a2', updatedAt: 1 },
      b: { id: 'b', content: '# B\n- [x] b1', updatedAt: 2 },
      c: { id: 'c', content: '# C\n- [ ] c1', updatedAt: 3 },
    }
    expect(collectTodos(docs).map((g) => [g.title, g.todos.map((t) => t.text)])).toEqual([
      ['C', ['c1']],
      ['A', ['a1']],
    ])
    expect(collectTodos(docs, { includeDone: true }).map((g) => g.title)).toEqual(['C', 'B', 'A'])
    expect(countOpenTodos(docs)).toBe(2)
  })
})

describe('Slack 向け変換', () => {
  it.each([
    ['**太字** と *斜体* と ~~取消~~', '*太字* と _斜体_ と ~取消~'],
    ['__太字__', '*太字*'],
    ['[サイト](https://example.com/a_b_c)', '<https://example.com/a_b_c|サイト>'],
    ['`**そのまま**` と **太字**', '`**そのまま**` と *太字*'],
    ['\\*記号\\* はそのまま', '*記号* はそのまま'],
    ['2 * 3 * 4', '2 * 3 * 4'],
  ])('行内 %j', (md, slack) => {
    expect(inline(md)).toBe(slack)
  })

  it('見出し・箇条書き・ToDo・引用・区切り線', () => {
    const md = ['# 見出し **強調**', '', '- 項目', '  - 子', '- [ ] やる', '- [x] やった', '', '> 引用 **太**', '', '---'].join('\n')
    expect(toSlackMrkdwn(md)).toBe(
      ['*見出し 強調*', '', '• 項目', '  • 子', '☐ やる', '☑ やった', '', '> 引用 *太*', '', '──────────'].join('\n'),
    )
  })

  it('表はコードブロックにし、コードブロックの中身は変えない（言語名は落とす）', () => {
    const md = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '', '```js', 'const x = **1**', '```'].join('\n')
    expect(toSlackMrkdwn(md)).toBe(['```', '| a | b |', '| --- | --- |', '| 1 | 2 |', '```', '', '```', 'const x = **1**', '```'].join('\n'))
  })

  it('コールアウトとトグル', () => {
    const md = ['> [!WARNING]', '>', '> 消さないで', '', '<details>', '<summary>詳細</summary>', '', '中身', '', '</details>'].join('\n')
    expect(toSlackMrkdwn(md)).toBe(['> *注意*', '> ', '> 消さないで', '', '*詳細*', '', '中身'].join('\n'))
  })

  it('閉じていないコードブロックは閉じる', () => {
    expect(toSlackMrkdwn('```\nx')).toBe('```\nx\n```')
  })
})
