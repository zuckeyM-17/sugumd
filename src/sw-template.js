// Service Worker（オフライン起動用）。ビルド時に vite.config.js が __PRECACHE__ と __VERSION__ を埋めて dist/sw.js にする。
//
// - インストール時: アプリ本体（HTML・JS・CSS・アイコン）を先に保存しておく
// - 画面を開くとき: 保存済みの HTML をすぐ返し、裏で最新を取りに行く（次回起動から新しい版になる）
// - それ以外のファイル: 保存済みならそれを返し、なければ取りに行って保存する
//   （Mermaid など、使ったときに初めて読むファイルも、一度使えばオフラインで使える）
const VERSION = __VERSION__
const PRECACHE = __PRECACHE__
const CACHE = `sugumd-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sugumd-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match('./index.html')
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put('./index.html', res.clone())
            return res
          })
          .catch(() => cached)
        return cached ?? network
      }),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      const res = await fetch(request)
      if (res.ok) cache.put(request, res.clone())
      return res
    }),
  )
})
