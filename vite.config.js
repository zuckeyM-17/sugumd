import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { defineConfig } from 'vite'

/**
 * ビルド時に Service Worker（dist/sw.js）を作る。
 * 起動に必要なファイル（入口の JS と、そこから静的に読み込まれる JS・CSS）と public/ のアイコン類を
 * 先読みリストに入れる。Mermaid のように後から読み込むファイルは入れない（数 MB あるため）。
 */
function serviceWorker() {
  return {
    name: 'sugumd-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = new Set(['./', './index.html', './manifest.webmanifest'])
      const visit = (fileName) => {
        const chunk = bundle[fileName]
        if (!chunk || files.has(`./${fileName}`)) return
        files.add(`./${fileName}`)
        if (chunk.type === 'chunk') {
          chunk.imports.forEach(visit)
          chunk.viteMetadata?.importedCss?.forEach((css) => files.add(`./${css}`))
        }
      }
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) visit(fileName)
        if (chunk.type === 'asset' && fileName.endsWith('.css')) files.add(`./${fileName}`)
      }
      for (const icon of ['icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png']) files.add(`./${icon}`)

      const precache = [...files].sort()
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8')
        .replace('const VERSION = __VERSION__', `const VERSION = ${JSON.stringify(version)}`)
        .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(precache, null, 2)}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  // GitHub Pages の https://<user>.github.io/<repo>/ 配下でも動くよう相対パスで出力する
  base: './',
  plugins: [serviceWorker()],
  test: {
    environment: 'jsdom',
  },
})
