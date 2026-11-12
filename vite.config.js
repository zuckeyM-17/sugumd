import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages の https://<user>.github.io/<repo>/ 配下でも動くよう相対パスで出力する
  base: './',
  test: {
    environment: 'jsdom',
  },
})
