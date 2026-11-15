// エディターにフォーカスを移す。コマンドの chain の中で .focus() を使わないための関数。
//
// Tiptap の focus コマンドは iPhone / Android では、コマンドの途中で即座に DOM にフォーカスを移し、
// それをきっかけに別の更新が先に適用される。すると残りの更新が古い状態のまま適用され、
// 「RangeError: Applying a mismatched transaction」になる。
// 先にここでフォーカスを済ませてから、focus を含まないコマンドを実行する。
import { Selection } from '@tiptap/pm/state'

/**
 * @param position 'start' | 'end' | undefined（今のカーソル位置のまま）
 */
export function ensureFocus(editor, position) {
  if (position === 'start' || position === 'end') {
    const { doc } = editor.state
    const selection = position === 'start' ? Selection.atStart(doc) : Selection.atEnd(doc)
    editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
  }
  if (!editor.view.hasFocus()) editor.view.focus()
}
