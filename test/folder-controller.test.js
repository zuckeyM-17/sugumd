import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFolderController } from '../src/folder-controller.js'
import { MANIFEST_NAME } from '../src/folder-sync.js'

// File System Access API のディレクトリハンドルをメモリ上で真似る
function fakeDirectory(name, initial = {}, { permission = 'granted' } = {}) {
  const files = new Map(Object.entries(initial).map(([k, v]) => [k, { content: v, lastModified: 100 }]))
  const dir = {
    name,
    files,
    permission,
    async queryPermission() {
      return dir.permission
    },
    async requestPermission() {
      return dir.permission
    },
    async *values() {
      for (const fileName of [...files.keys()]) yield fileHandle(fileName)
    },
    async getFileHandle(fileName) {
      if (dir.permission !== 'granted') throw new DOMException('denied', 'NotAllowedError')
      return fileHandle(fileName)
    },
    async removeEntry(fileName) {
      if (!files.delete(fileName)) throw new DOMException('missing', 'NotFoundError')
    },
  }
  function fileHandle(fileName) {
    return {
      kind: 'file',
      name: fileName,
      async getFile() {
        const f = files.get(fileName)
        return { text: async () => f.content, lastModified: f.lastModified }
      },
      async createWritable() {
        let buf = ''
        return {
          write: async (s) => (buf += s),
          close: async () => files.set(fileName, { content: buf, lastModified: Date.now() }),
        }
      },
    }
  }
  return dir
}

function setup(docs, dir) {
  const statuses = []
  const errors = []
  let state = { ...docs }
  window.showDirectoryPicker = vi.fn(async () => dir)
  const controller = createFolderController({
    getDocs: () => state,
    applyUpserts: (list) => {
      for (const d of list) state[d.id] = d
    },
    newId: (() => {
      let n = 0
      return () => `imported-${++n}`
    })(),
    onStatus: (s) => statuses.push(s.status),
    onError: (e) => errors.push(e),
  })
  const flush = () => controller.whenIdle()
  return { controller, statuses, errors, getState: () => state, flush }
}

const doc = (id, content, updatedAt = 200) => ({ id, content, createdAt: 1, updatedAt })

beforeEach(() => {
  delete window.showDirectoryPicker
})

describe('フォルダ保存', () => {
  it('フォルダを選ぶと、手元のドキュメントを .md で書き出し、対応表を作る', async () => {
    const dir = fakeDirectory('notes')
    const { controller, statuses } = setup({ a: doc('a', '# 議事録\n本文') }, dir)
    await controller.choose()
    expect(dir.files.get('議事録.md').content).toBe('# 議事録\n本文')
    expect(JSON.parse(dir.files.get(MANIFEST_NAME).content).files).toEqual({ a: { name: '議事録.md' } })
    expect(statuses.at(-1)).toBe('connected')
    expect(controller.connected).toBe(true)
  })

  it('既存の .md を取り込む', async () => {
    const dir = fakeDirectory('notes', { 'メモ.md': '# メモ' })
    const { controller, getState } = setup({}, dir)
    await controller.choose()
    expect(Object.values(getState()).map((d) => d.content)).toEqual(['# メモ'])
  })

  it('保存のたびにファイルを更新し、タイトルが変われば改名する', async () => {
    const dir = fakeDirectory('notes')
    const { controller, flush } = setup({ a: doc('a', '# 旧題') }, dir)
    await controller.choose()
    controller.saveDoc(doc('a', '# 新題\n追記'))
    await flush()
    expect(dir.files.has('旧題.md')).toBe(false)
    expect(dir.files.get('新題.md').content).toBe('# 新題\n追記')
  })

  it('アプリで削除するとファイルも消える', async () => {
    const dir = fakeDirectory('notes')
    const { controller, flush } = setup({ a: doc('a', '# A'), b: doc('b', '# B') }, dir)
    await controller.choose()
    controller.removeDoc('a')
    await flush()
    expect([...dir.files.keys()].sort()).toEqual([MANIFEST_NAME, 'B.md'])
  })

  it('フォルダ選択をキャンセルしても何も起きない', async () => {
    const { controller, statuses } = setup({ a: doc('a', '# A') }, fakeDirectory('x'))
    window.showDirectoryPicker = vi.fn(async () => {
      throw new DOMException('cancel', 'AbortError')
    })
    await controller.choose()
    expect(controller.connected).toBe(false)
    expect(statuses).toEqual([])
  })

  it('アクセスを拒否されたら接続しない', async () => {
    const dir = fakeDirectory('notes', {}, { permission: 'denied' })
    const { controller } = setup({ a: doc('a', '# A') }, dir)
    await controller.choose()
    expect(controller.connected).toBe(false)
    expect(dir.files.size).toBe(0)
  })

  it('途中で権限が外れたら「再接続」状態になり、許可後に書き込みを再開できる', async () => {
    const dir = fakeDirectory('notes')
    const { controller, statuses, errors, flush } = setup({ a: doc('a', '# A') }, dir)
    await controller.choose()
    dir.permission = 'denied'
    controller.saveDoc(doc('a', '# A\n更新'))
    await flush()
    expect(statuses.at(-1)).toBe('reconnect')
    expect(errors).toHaveLength(1)
    dir.permission = 'granted'
    await controller.reconnect()
    expect(statuses.at(-1)).toBe('connected')
  })

  it('非対応ブラウザでは unsupported', async () => {
    const { controller, statuses } = setup({}, fakeDirectory('x'))
    delete window.showDirectoryPicker
    await controller.init()
    expect(statuses).toEqual(['unsupported'])
  })
})
