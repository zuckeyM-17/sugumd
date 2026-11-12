// フォルダ保存の状態遷移と書き込み順序を管理する。
// 書き込みはキューで 1 つずつ実行する（改名と保存が前後して古い内容で上書きしないため）。
import { planDocWrite, planSync } from './folder-sync.js'
import {
  forgetHandle,
  hasPermission,
  isFolderSupported,
  loadSavedHandle,
  pickFolder,
  readFolder,
  removeFile,
  saveHandle,
  writeManifest,
  writeTextFile,
} from './folder-store.js'

/**
 * status: 'unsupported' | 'none' | 'syncing' | 'connected' | 'reconnect' | 'error'
 */
export function createFolderController({ getDocs, applyUpserts, newId, onStatus, onError, onSynced }) {
  let handle = null // 接続中のフォルダ
  let pending = null // 権限の再許可待ちのフォルダ
  let manifest = {}
  let queue = Promise.resolve()
  let status = 'none'

  const setStatus = (next) => {
    status = next
    onStatus({ status, folderName: (handle ?? pending)?.name ?? '' })
  }
  // 一度失敗しても、次の書き込みが通れば表示を戻す
  const markHealthy = () => {
    if (status === 'error') setStatus('connected')
  }

  function enqueue(task) {
    queue = queue.then(task).catch((err) => {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        // 権限が外れた: 再接続を促す
        pending = handle ?? pending
        handle = null
        setStatus('reconnect')
      } else {
        setStatus('error')
      }
      onError(err)
    })
    return queue
  }

  function sync(target) {
    return enqueue(async () => {
      setStatus('syncing')
      const folder = await readFolder(target)
      const plan = planSync({ docs: getDocs(), manifest: folder.manifest, files: folder.files, newId })
      applyUpserts(plan.upserts)
      for (const w of plan.writes) await writeTextFile(target, w.name, w.content)
      for (const name of plan.removes) await removeFile(target, name)
      await writeManifest(target, plan.manifest)
      handle = target
      pending = null
      manifest = plan.manifest
      await saveHandle(target).catch(() => {})
      setStatus('connected')
      onSynced?.(plan)
    })
  }

  return {
    get connected() {
      return handle != null
    },

    /** 起動時: 前回のフォルダが許可済みなら自動で同期、未許可なら再接続ボタンを出す。 */
    async init() {
      if (!isFolderSupported()) return setStatus('unsupported')
      const saved = await loadSavedHandle()
      if (!saved) return setStatus('none')
      if (await hasPermission(saved).catch(() => false)) return sync(saved)
      pending = saved
      setStatus('reconnect')
    },

    /** フォルダを選んで接続する（ユーザー操作から呼ぶ）。 */
    async choose() {
      let picked
      try {
        picked = await pickFolder()
      } catch (err) {
        if (err?.name === 'AbortError') return // キャンセル
        throw err
      }
      if (!(await hasPermission(picked, { request: true }))) return
      return sync(picked)
    },

    /** 再接続（ユーザー操作から呼ぶ。権限ダイアログが出る）。 */
    async reconnect() {
      const target = pending ?? handle
      if (!target) return
      if (!(await hasPermission(target, { request: true }))) return
      return sync(target)
    },

    /** バックアップ復元後など、手元の変更をまとめてフォルダに反映する。 */
    resync() {
      return handle ? sync(handle) : Promise.resolve()
    },

    /** 予約済みの書き込みがすべて終わるまで待つ。 */
    whenIdle() {
      return queue
    },

    async disconnect() {
      await queue
      handle = null
      pending = null
      manifest = {}
      await forgetHandle().catch(() => {})
      setStatus('none')
    },

    saveDoc(doc) {
      if (!handle) return
      const snapshot = { ...doc }
      enqueue(async () => {
        const plan = planDocWrite(snapshot, manifest)
        if (!plan) return
        await writeTextFile(handle, plan.write.name, plan.write.content)
        if (plan.remove) await removeFile(handle, plan.remove)
        const renamedOrNew = manifest[snapshot.id]?.name !== plan.write.name
        manifest = plan.manifest
        if (renamedOrNew) await writeManifest(handle, manifest)
        markHealthy()
      })
    },

    removeDoc(id) {
      if (!handle) return
      enqueue(async () => {
        const name = manifest[id]?.name
        if (!name) return
        await removeFile(handle, name)
        const { [id]: _removed, ...rest } = manifest
        manifest = rest
        await writeManifest(handle, manifest)
      })
    },
  }
}
