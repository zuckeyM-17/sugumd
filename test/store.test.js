import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  STORAGE_KEY,
  createDoc,
  deleteDoc,
  deriveTitle,
  emptyState,
  exportBackup,
  importBackup,
  listDocs,
  loadState,
  saveState,
  updateDocContent,
} from '../src/store.js'

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

describe('loadState / saveState', () => {
  it('保存した状態を読み戻せる', () => {
    const storage = memoryStorage()
    const state = createDoc(emptyState(), { id: 'a', now: 1, content: '# A' })
    expect(saveState(storage, state)).toEqual({ ok: true })
    expect(loadState(storage)).toEqual({ state, recovered: false })
  })

  it('何も保存されていなければ空状態', () => {
    expect(loadState(memoryStorage()).state).toEqual(emptyState())
  })

  it('壊れた JSON は退避キーに残してから空状態で始める', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{broken' })
    const result = loadState(storage, 123)
    expect(result.recovered).toBe(true)
    expect(result.state).toEqual(emptyState())
    expect(storage.getItem(`${STORAGE_KEY}:corrupt-123`)).toBe('{broken')
  })

  it('形の不正なドキュメントは捨て、存在しない currentId は null にする', () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        docs: { a: { id: 'a', content: 'ok', createdAt: 1, updatedAt: 1 }, b: { id: 'b', content: 3 } },
        currentId: 'zzz',
      }),
    })
    const { state } = loadState(storage)
    expect(Object.keys(state.docs)).toEqual(['a'])
    expect(state.currentId).toBeNull()
  })

  it('容量超過などで書けないときは ok: false を返す', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    }
    expect(saveState(storage, emptyState()).ok).toBe(false)
  })
})

describe('ドキュメント操作', () => {
  it('作成したドキュメントが選択状態になる', () => {
    const state = createDoc(emptyState(), { id: 'a', now: 10 })
    expect(state.currentId).toBe('a')
    expect(state.docs.a).toEqual({ id: 'a', content: '', createdAt: 10, updatedAt: 10 })
  })

  it('本文が変わったときだけ updatedAt を更新する', () => {
    const s1 = createDoc(emptyState(), { id: 'a', now: 1, content: 'x' })
    expect(updateDocContent(s1, 'a', 'x', 5)).toBe(s1)
    expect(updateDocContent(s1, 'a', 'y', 5).docs.a).toMatchObject({ content: 'y', updatedAt: 5 })
    expect(updateDocContent(s1, 'missing', 'y', 5)).toBe(s1)
  })

  it('表示中のドキュメントを消すと、次に新しいものへ移る', () => {
    let s = createDoc(emptyState(), { id: 'old', now: 1 })
    s = createDoc(s, { id: 'mid', now: 2 })
    s = createDoc(s, { id: 'new', now: 3 })
    s = deleteDoc(s, 'new')
    expect(s.currentId).toBe('mid')
    expect(deleteDoc(deleteDoc(s, 'mid'), 'old').currentId).toBeNull()
  })

  it('一覧は更新が新しい順', () => {
    let s = createDoc(emptyState(), { id: 'a', now: 1, content: '# A' })
    s = createDoc(s, { id: 'b', now: 2, content: '# B' })
    s = updateDocContent(s, 'a', '# A2', 3)
    expect(listDocs(s).map((d) => d.title)).toEqual(['A2', 'B'])
  })
})

describe('deriveTitle', () => {
  it.each([
    ['# 見出し\n本文', '見出し'],
    ['前置き\n## 中見出し', '中見出し'],
    ['- [ ] **やること**', 'やること'],
    ['[リンク](https://example.com) です', 'リンク です'],
    ['', '無題'],
    ['\n\n  \n', '無題'],
  ])('%j → %s', (md, title) => {
    expect(deriveTitle(md)).toBe(title)
  })
})

describe('バックアップ', () => {
  it('書き出したものを空の環境に取り込める', () => {
    let s = createDoc(emptyState(), { id: 'a', now: 1, content: 'A' })
    s = createDoc(s, { id: 'b', now: 2, content: 'B' })
    const backup = JSON.parse(JSON.stringify(exportBackup(s, 0)))
    expect(backup.format).toBe(BACKUP_FORMAT)
    const result = importBackup(emptyState(), backup)
    expect(result).toMatchObject({ added: 2, updated: 0, skipped: 0 })
    expect(result.state.docs).toEqual(s.docs)
    expect(result.state.currentId).toBe('b')
  })

  it('同じ id は新しい方を残す（手元の新しい編集を巻き戻さない）', () => {
    const local = createDoc(emptyState(), { id: 'a', now: 10, content: '手元の最新' })
    const older = { format: BACKUP_FORMAT, docs: [{ id: 'a', content: '古い', createdAt: 1, updatedAt: 5 }] }
    const newer = { format: BACKUP_FORMAT, docs: [{ id: 'a', content: '新しい', createdAt: 1, updatedAt: 20 }] }
    expect(importBackup(local, older).state.docs.a.content).toBe('手元の最新')
    expect(importBackup(local, newer).state.docs.a.content).toBe('新しい')
  })

  it('形式の違うファイルは拒否し、壊れた要素は飛ばす', () => {
    expect(() => importBackup(emptyState(), { docs: [] })).toThrow()
    expect(() => importBackup(emptyState(), null)).toThrow()
    const result = importBackup(emptyState(), { format: BACKUP_FORMAT, docs: [{ id: 'x' }] })
    expect(result).toMatchObject({ added: 0, skipped: 1 })
  })
})
