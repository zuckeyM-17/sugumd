# sugumd

**すぐ書けて、すぐ整って、すぐコピーできる。** ブラウザだけで動く Markdown エディターです。

Markdown を打つとその場で見出しや表に整形され、右側の目次で全体を見渡せます。書いたものは「全体をコピー」で Notion などにそのまま貼れます。サーバー不要で、GitHub Pages で公開しています。

🔗 https://zuckeym-17.github.io/sugumd/

## できること

- 複数ドキュメントの作成・一覧・切り替え・削除（フォルダなし、更新が新しい順）
- 入力と同時に整形（`# ` 見出し、`- ` 箇条書き、`1. ` 番号付き、`[] ` ToDo、`> ` 引用、```` ``` ```` コード）
- 右側に見出しの目次。クリックでその見出しへ移動、スクロール位置に合わせて現在地を強調
- 表
  - `/` → 「テーブル」でマス目から行数 × 列数を選んで挿入（数値入力なら最大 50 行 × 20 列）
  - `/3x4` と打てば 3 行 × 4 列をすぐ挿入（1 行目は見出し行）
  - 表にマウスを乗せると下端・右端に「+」が出て、行・列を末尾に追加
  - 表の中にカーソルがあると右上に「表 ▾」が出て、途中への行・列の追加と削除
  - 最終セルで Tab を押すと行が増える
- 「全体をコピー」: Markdown と HTML の両方をクリップボードに載せる（Notion などに貼ると見出し・表が再現される）。「…」→「Markdown テキストだけコピー」もあり
- 「Markdown表示」で生の Markdown を直接編集
- Markdown のテキストを貼り付けると整形して取り込む
- 保存: ブラウザの localStorage に自動保存（0.5 秒後）。`navigator.storage.persist()` で自動削除されにくくしている
- バックアップ: 「…」メニューから全ドキュメントを JSON で書き出し／復元（同じドキュメントは新しい方を残す）、1 件ずつ `.md` で保存

## 開発

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # ユニットテスト（Vitest + jsdom）
npm run build   # dist/ に静的ファイルを出力
```

## GitHub Pages への公開

1. このディレクトリを GitHub リポジトリとして push（ブランチは `main`）
2. リポジトリの Settings → Pages → Build and deployment の Source を **GitHub Actions** にする
3. `main` に push すると `.github/workflows/deploy.yml` がテスト → ビルド → 公開する

`vite.config.js` の `base: './'` により、`https://<user>.github.io/<repo>/` のようなサブパスでもそのまま動きます。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/store.js` | ドキュメントの保存・読み込み・バックアップ（純粋関数） |
| `src/editor.js` | Tiptap エディターの組み立て、Markdown 貼り付け |
| `src/slash-command.js` | `/` コマンドメニュー |
| `src/table-picker.js` | 表のサイズを選ぶマス目 |
| `src/table-controls.js` | 表の「+」バーと「表 ▾」メニュー |
| `src/markdown-utils.js` | 目次の抽出、表サイズの解釈、Markdown 判定 |
| `src/main.js` | 画面の組み立てとイベント |

## 制約

- データは「そのブラウザのそのサイト」にだけ保存される。別の PC・別のブラウザとは共有されない。ブラウザのデータ削除で消えるので、定期的にバックアップを書き出すこと
- 画像、脚注、表のセル結合など、この編集画面に機能がない Markdown 記法は、編集すると失われる
- 表の中に表は作れない（Markdown で表せないため）
