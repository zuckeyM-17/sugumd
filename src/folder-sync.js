// フォルダ保存の「何を読み書きするか」を決める純粋な関数群。実際のファイル操作は folder-store.js。
//
// フォルダの中身:
//   <タイトル>.md   … 1 ドキュメント = 1 ファイル。本文は Markdown そのまま
//   .sugumd.json    … どのファイルがどのドキュメント(id)か の対応表 (manifest)
import { deriveTitle } from './store.js'

export const MANIFEST_NAME = '.sugumd.json'

/** タイトルを、Windows / macOS どちらでも使えるファイル名の基部にする。 */
export function sanitizeFileBase(title) {
  const base = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // Windows は末尾のドット・空白を許さない
    .slice(0, 60)
    .trim()
  return base || 'Untitled'
}

/**
 * ドキュメント id に使うファイル名を決める。
 * 他のドキュメントが使っている名前とは重ならないよう「(2)」などを付ける。
 * 今の名前がタイトルに合っていれば、番号付きでもそのまま使い続ける（不要な改名をしない）。
 */
export function assignFileName(title, id, manifest) {
  const base = sanitizeFileBase(title)
  const taken = new Set(
    Object.entries(manifest)
      .filter(([otherId]) => otherId !== id)
      .map(([, entry]) => entry.name.toLowerCase()),
  )
  const current = manifest[id]?.name
  if (current && isNameForBase(current, base) && !taken.has(current.toLowerCase())) return current
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}.md` : `${base} (${n}).md`
    if (!taken.has(name.toLowerCase())) return name
  }
}

function isNameForBase(name, base) {
  if (name === `${base}.md`) return true
  const m = /^(.*) \((\d+)\)\.md$/.exec(name)
  return m != null && m[1] === base
}

export function parseManifest(text) {
  try {
    const data = JSON.parse(text)
    const files = {}
    for (const [id, entry] of Object.entries(data?.files ?? {})) {
      if (typeof entry?.name === 'string' && entry.name.toLowerCase().endsWith('.md')) files[id] = { name: entry.name }
    }
    return files
  } catch {
    return {}
  }
}

export function serializeManifest(manifest) {
  return JSON.stringify({ app: 'sugumd', version: 1, files: manifest }, null, 2) + '\n'
}

/**
 * フォルダ接続時の同期計画を立てる。
 * - 両方にあるもの: 内容が違えば更新日時が新しい方に合わせる
 * - フォルダにだけあるもの: ドキュメントとして取り込む（ブラウザのデータが消えたときの復元にもなる）
 * - ブラウザにだけあるもの: ファイルとして書き出す（空のドキュメントは書き出さない）
 * - フォルダから消えたファイル: 消さずに書き戻す（データを失う方向には倒さない）
 *
 * @param docs      state.docs
 * @param manifest  { [id]: { name } }
 * @param files     [{ name, content, lastModified }] フォルダ直下の .md
 * @param newId     未登録ファイルに振る id を作る関数
 * @returns { upserts: Doc[], writes: [{id, name, content}], removes: string[], manifest }
 */
export function planSync({ docs, manifest, files, newId }) {
  const fileByName = new Map(files.map((f) => [f.name.toLowerCase(), f]))
  const claimed = new Set()
  const merged = {} // id -> { doc, file }
  const upserts = []

  for (const [id, entry] of Object.entries(manifest)) {
    const file = fileByName.get(entry.name.toLowerCase())
    if (file) claimed.add(file.name.toLowerCase())
    const doc = docs[id]
    if (doc) {
      if (file && file.content !== doc.content && file.lastModified > doc.updatedAt) {
        const updated = { ...doc, content: file.content, updatedAt: file.lastModified }
        upserts.push(updated)
        merged[id] = { doc: updated, file }
      } else {
        merged[id] = { doc, file }
      }
    } else if (file) {
      const imported = { id, content: file.content, createdAt: file.lastModified, updatedAt: file.lastModified }
      upserts.push(imported)
      merged[id] = { doc: imported, file }
    }
  }

  for (const file of files) {
    if (claimed.has(file.name.toLowerCase())) continue
    const id = newId()
    const imported = { id, content: file.content, createdAt: file.lastModified, updatedAt: file.lastModified }
    upserts.push(imported)
    // 取り込んだファイルは元の名前のまま使う（勝手に改名しない）
    merged[id] = { doc: imported, file, keepName: file.name }
  }

  for (const doc of Object.values(docs)) {
    if (!merged[doc.id] && doc.content.trim() !== '') merged[doc.id] = { doc, file: null }
  }

  // 既存ファイルの名前を先に押さえてから名前を割り当てる（改名先が他の既存ファイルと衝突しないように）
  const nextManifest = {}
  for (const [id, { file }] of Object.entries(merged)) if (file) nextManifest[id] = { name: file.name }
  const writes = []
  const oldNames = []
  for (const [id, { doc, file, keepName }] of Object.entries(merged)) {
    const name = keepName ?? assignFileName(deriveTitle(doc.content), id, nextManifest)
    nextManifest[id] = { name }
    const renamed = file != null && file.name !== name
    if (renamed) oldNames.push(file.name)
    if (renamed || file == null || file.content !== doc.content) writes.push({ id, name, content: doc.content })
  }
  // 改名で空いた名前を別のドキュメントが使う場合は消さない
  const finalNames = new Set(Object.values(nextManifest).map((e) => e.name.toLowerCase()))
  const removes = oldNames.filter((n) => !finalNames.has(n.toLowerCase()))

  return { upserts, writes, removes, manifest: nextManifest }
}

/**
 * 1 件保存したときの書き込み内容。タイトルが変わっていれば改名（新しい名前で書いて古いファイルを消す）。
 * 空のドキュメントはファイルを作らない（既にあるファイルは空で上書きする）。
 */
export function planDocWrite(doc, manifest) {
  const current = manifest[doc.id]?.name
  if (!current && doc.content.trim() === '') return null
  const name = assignFileName(deriveTitle(doc.content), doc.id, manifest)
  return {
    write: { name, content: doc.content },
    remove: current && current !== name ? current : null,
    manifest: { ...manifest, [doc.id]: { name } },
  }
}
