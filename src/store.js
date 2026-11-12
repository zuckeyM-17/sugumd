// ドキュメントの保存・読み込み・バックアップを扱う純粋な関数群。
// storage は localStorage 互換 (getItem / setItem) を受け取るので、テストでは差し替えられる。

export const STORAGE_KEY = 'sugumd:v1'
export const BACKUP_FORMAT = 'sugumd-backup'

export function emptyState() {
  return { version: 1, docs: {}, currentId: null }
}

function isValidDoc(doc) {
  return (
    doc != null &&
    typeof doc.id === 'string' &&
    typeof doc.content === 'string' &&
    Number.isFinite(doc.createdAt) &&
    Number.isFinite(doc.updatedAt)
  )
}

function normalizeState(parsed) {
  const state = emptyState()
  if (parsed == null || typeof parsed !== 'object' || parsed.docs == null) return state
  for (const doc of Object.values(parsed.docs)) {
    if (isValidDoc(doc)) state.docs[doc.id] = { ...doc }
  }
  state.currentId = state.docs[parsed.currentId] ? parsed.currentId : null
  return state
}

/**
 * 保存済みの状態を読み込む。
 * JSON が壊れていた場合は、次回保存で上書きして失わないよう退避キーにコピーしてから空状態を返す。
 */
export function loadState(storage, now = Date.now()) {
  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { state: emptyState(), recovered: false }
  }
  if (raw == null) return { state: emptyState(), recovered: false }
  try {
    return { state: normalizeState(JSON.parse(raw)), recovered: false }
  } catch {
    try {
      storage.setItem(`${STORAGE_KEY}:corrupt-${now}`, raw)
    } catch {
      // 退避もできない場合は諦めるが、元のキーはまだ上書きしていない
    }
    return { state: emptyState(), recovered: true }
  }
}

export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

export function createDoc(state, { id, now, content = '' }) {
  const doc = { id, content, createdAt: now, updatedAt: now }
  return { ...state, docs: { ...state.docs, [id]: doc }, currentId: id }
}

export function updateDocContent(state, id, content, now) {
  const doc = state.docs[id]
  if (!doc || doc.content === content) return state
  return { ...state, docs: { ...state.docs, [id]: { ...doc, content, updatedAt: now } } }
}

export function selectDoc(state, id) {
  if (!state.docs[id]) return state
  return { ...state, currentId: id }
}

export function deleteDoc(state, id) {
  if (!state.docs[id]) return state
  const docs = { ...state.docs }
  delete docs[id]
  let currentId = state.currentId
  if (currentId === id) {
    const next = sortByUpdated(Object.values(docs))[0]
    currentId = next ? next.id : null
  }
  return { ...state, docs, currentId }
}

function sortByUpdated(docs) {
  return [...docs].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Markdown 本文から一覧に出すタイトルを作る。最初の見出し、なければ最初の非空行。 */
export function deriveTitle(markdown) {
  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean)
  const heading = lines.find((l) => /^#{1,6}\s+\S/.test(l))
  const line = heading ?? lines[0]
  if (!line) return 'Untitled'
  const text = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/, '')
    .replace(/^>\s*/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
  return text || 'Untitled'
}

export function listDocs(state) {
  return sortByUpdated(Object.values(state.docs)).map((doc) => ({
    id: doc.id,
    title: deriveTitle(doc.content),
    updatedAt: doc.updatedAt,
  }))
}

export function exportBackup(state, now) {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date(now).toISOString(),
    docs: sortByUpdated(Object.values(state.docs)),
  }
}

/**
 * バックアップを取り込む。同じ id は updatedAt が新しい方を残す(手元の新しい編集を巻き戻さない)。
 */
export function importBackup(state, data) {
  if (data == null || data.format !== BACKUP_FORMAT || !Array.isArray(data.docs)) {
    throw new Error('This file is not a sugumd backup')
  }
  const docs = { ...state.docs }
  let added = 0
  let updated = 0
  let skipped = 0
  for (const doc of data.docs) {
    if (!isValidDoc(doc)) {
      skipped++
      continue
    }
    const existing = docs[doc.id]
    if (!existing) {
      docs[doc.id] = { ...doc }
      added++
    } else if (doc.updatedAt > existing.updatedAt) {
      docs[doc.id] = { ...doc }
      updated++
    } else {
      skipped++
    }
  }
  const currentId = state.currentId ?? sortByUpdated(Object.values(docs))[0]?.id ?? null
  return { state: { ...state, docs, currentId }, added, updated, skipped }
}
