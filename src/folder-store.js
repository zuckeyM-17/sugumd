// File System Access API でフォルダを読み書きする薄いアダプター。
// Chrome / Edge などの Chromium 系ブラウザでのみ使える（Safari / Firefox は未対応）。
import { MANIFEST_NAME, parseManifest, serializeManifest } from './folder-sync.js'

export function isFolderSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function pickFolder() {
  return window.showDirectoryPicker({ id: 'sugumd', mode: 'readwrite' })
}

/** 権限を確認する。request: true ならユーザー操作の中で許可を求める。 */
export async function hasPermission(handle, { request = false } = {}) {
  const opts = { mode: 'readwrite' }
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  if (!request) return false
  return (await handle.requestPermission?.(opts)) === 'granted'
}

/** フォルダ直下の .md と対応表を読む。サブフォルダは見ない。 */
export async function readFolder(handle) {
  const files = []
  let manifest = {}
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue
    if (entry.name === MANIFEST_NAME) {
      manifest = parseManifest(await (await entry.getFile()).text())
    } else if (entry.name.toLowerCase().endsWith('.md')) {
      const file = await entry.getFile()
      files.push({ name: entry.name, content: await file.text(), lastModified: file.lastModified })
    }
  }
  return { manifest, files }
}

export async function writeTextFile(handle, name, content) {
  const fileHandle = await handle.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function removeFile(handle, name) {
  try {
    await handle.removeEntry(name)
  } catch (err) {
    if (err?.name !== 'NotFoundError') throw err
  }
}

export function writeManifest(handle, manifest) {
  return writeTextFile(handle, MANIFEST_NAME, serializeManifest(manifest))
}

// ---- 選んだフォルダを次回も使えるよう IndexedDB に覚えておく（ハンドルは localStorage に入らない） ----
const DB_NAME = 'sugumd'
const STORE = 'kv'
const HANDLE_KEY = 'folderHandle'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function kv(mode, fn) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export const loadSavedHandle = () => kv('readonly', (s) => s.get(HANDLE_KEY)).catch(() => null)
export const saveHandle = (handle) => kv('readwrite', (s) => s.put(handle, HANDLE_KEY))
export const forgetHandle = () => kv('readwrite', (s) => s.delete(HANDLE_KEY))
