import { describe, expect, it } from 'vitest'
import { assignFileName, parseManifest, planDocWrite, planSync, sanitizeFileBase, serializeManifest } from '../src/folder-sync.js'

const doc = (id, content, updatedAt = 100) => ({ id, content, createdAt: 1, updatedAt })
const file = (name, content, lastModified = 100) => ({ name, content, lastModified })
let seq = 0
const newId = () => `new-${++seq}`

describe('ファイル名', () => {
  it.each([
    ['議事録', '議事録'],
    ['a/b:c*?', 'a_b_c__'],
    ['末尾のドット...', '末尾のドット'],
    ['  ', '無題'],
    ['あ'.repeat(80), 'あ'.repeat(60)],
  ])('%j → %j', (title, base) => expect(sanitizeFileBase(title)).toBe(base))

  it('他のドキュメントと重なる名前には番号を付ける（大文字小文字は同一視）', () => {
    const manifest = { a: { name: 'Memo.md' }, b: { name: 'memo (2).md' } }
    expect(assignFileName('memo', 'c', manifest)).toBe('memo (3).md')
  })

  it('タイトルに合う今の名前は、番号付きでも使い続ける', () => {
    const manifest = { a: { name: 'memo.md' }, b: { name: 'memo (2).md' } }
    expect(assignFileName('memo', 'b', manifest)).toBe('memo (2).md')
  })

  it('壊れた対応表は空として扱う', () => {
    expect(parseManifest('{oops')).toEqual({})
    expect(parseManifest(serializeManifest({ a: { name: 'x.md' }, b: { name: 'evil.exe' } }))).toEqual({ a: { name: 'x.md' } })
  })
})

describe('planSync（フォルダ接続時の同期）', () => {
  it('空のフォルダには、手元の空でないドキュメントを書き出す', () => {
    const plan = planSync({ docs: { a: doc('a', '# 議事録'), b: doc('b', '') }, manifest: {}, files: [], newId })
    expect(plan.writes).toEqual([{ id: 'a', name: '議事録.md', content: '# 議事録' }])
    expect(plan.manifest).toEqual({ a: { name: '議事録.md' } })
    expect(plan.upserts).toEqual([])
  })

  it('ブラウザのデータが消えても、フォルダから同じ id で復元できる', () => {
    const plan = planSync({
      docs: {},
      manifest: { a: { name: '議事録.md' } },
      files: [file('議事録.md', '# 議事録', 50)],
      newId,
    })
    expect(plan.upserts).toEqual([{ id: 'a', content: '# 議事録', createdAt: 50, updatedAt: 50 }])
    expect(plan.writes).toEqual([])
  })

  it('対応表にないファイルは新しいドキュメントとして元の名前のまま取り込む', () => {
    const plan = planSync({ docs: {}, manifest: {}, files: [file('my note.md', '本文')], newId })
    expect(plan.upserts).toHaveLength(1)
    expect(plan.upserts[0].content).toBe('本文')
    expect(Object.values(plan.manifest)).toEqual([{ name: 'my note.md' }])
    expect(plan.writes).toEqual([])
  })

  it('内容が違えば新しい方に合わせる', () => {
    const manifest = { a: { name: 'A.md' } }
    const fileNewer = planSync({ docs: { a: doc('a', '# A 古い', 100) }, manifest, files: [file('A.md', '# A 新しい', 200)], newId })
    expect(fileNewer.upserts[0]).toMatchObject({ id: 'a', content: '# A 新しい', updatedAt: 200 })

    const localNewer = planSync({ docs: { a: doc('a', '# A 新しい', 300) }, manifest, files: [file('A.md', '# A 古い', 200)], newId })
    expect(localNewer.upserts).toEqual([])
    expect(localNewer.writes).toEqual([{ id: 'a', name: 'A 新しい.md', content: '# A 新しい' }])
    expect(localNewer.removes).toEqual(['A.md'])
  })

  it('フォルダから消えたファイルは、消さずに書き戻す', () => {
    const plan = planSync({ docs: { a: doc('a', '# A') }, manifest: { a: { name: 'A.md' } }, files: [], newId })
    expect(plan.writes).toEqual([{ id: 'a', name: 'A.md', content: '# A' }])
    expect(plan.removes).toEqual([])
  })

  it('改名先が別の既存ファイルと重なるときは番号を付け、他のファイルを消さない', () => {
    const plan = planSync({
      docs: { a: doc('a', '# B', 300), b: doc('b', '# B', 100) },
      manifest: { a: { name: 'A.md' }, b: { name: 'B.md' } },
      files: [file('A.md', '# A', 50), file('B.md', '# B', 100)],
      newId,
    })
    expect(plan.manifest).toEqual({ a: { name: 'B (2).md' }, b: { name: 'B.md' } })
    expect(plan.removes).toEqual(['A.md'])
  })

  it('同じ内容なら何もしない', () => {
    const plan = planSync({ docs: { a: doc('a', '# A') }, manifest: { a: { name: 'A.md' } }, files: [file('A.md', '# A', 999)], newId })
    expect(plan).toMatchObject({ upserts: [], writes: [], removes: [] })
  })
})

describe('planDocWrite（1 件保存）', () => {
  it('新しいドキュメントはタイトル名で作る', () => {
    expect(planDocWrite(doc('a', '# 議事録'), {})).toEqual({
      write: { name: '議事録.md', content: '# 議事録' },
      remove: null,
      manifest: { a: { name: '議事録.md' } },
    })
  })

  it('タイトルが変わったら改名する', () => {
    const plan = planDocWrite(doc('a', '# 新しい題'), { a: { name: '古い題.md' } })
    expect(plan.write.name).toBe('新しい題.md')
    expect(plan.remove).toBe('古い題.md')
  })

  it('空のドキュメントはファイルを作らない', () => {
    expect(planDocWrite(doc('a', ''), {})).toBeNull()
  })
})
