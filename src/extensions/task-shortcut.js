// Makes "- [ ] " produce a to-do item.
// "- " turns the line into a bullet list first, so TaskItem's own input rule ("[ ] " at the start of a
// plain paragraph) never fires. When "[ ] " / "[x] " is typed at the start of a bullet item, convert just
// that item into a to-do, splitting the bullet list around it.
import { Extension, InputRule } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

export const TASK_SHORTCUT_RE = /^\s*\[([ xX]?)\]\s$/

export const TaskShortcut = Extension.create({
  name: 'taskShortcut',
  priority: 1000, // run before TaskItem's input rule

  addInputRules() {
    return [
      new InputRule({
        find: TASK_SHORTCUT_RE,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from)
          const depth = $from.depth
          if (depth < 3) return null
          const paragraph = $from.node(depth)
          const item = $from.node(depth - 1)
          const list = $from.node(depth - 2)
          const atItemStart =
            item.type.name === 'listItem' && item.firstChild === paragraph && range.from === $from.start(depth)
          const { taskList, taskItem } = state.schema.nodes
          if (!atItemStart || list.type.name !== 'bulletList' || !taskList || !taskItem) return null

          const { tr } = state
          const listPos = $from.before(depth - 2)
          const index = $from.index(depth - 2)
          tr.delete(range.from, range.to)
          const current = tr.doc.nodeAt(listPos)
          const items = []
          current.forEach((child) => items.push(child))

          const before = items.slice(0, index)
          const after = items.slice(index + 1)
          const todo = taskItem.create({ checked: match[1].toLowerCase() === 'x' }, items[index].content)
          const nodes = []
          if (before.length) nodes.push(current.type.create(current.attrs, before))
          nodes.push(taskList.create(null, todo))
          if (after.length) nodes.push(current.type.create(current.attrs, after))
          tr.replaceWith(listPos, listPos + current.nodeSize, nodes)

          // cursor: start of the new to-do's text (taskList > taskItem > paragraph)
          const textStart = listPos + (before.length ? nodes[0].nodeSize : 0) + 3
          tr.setSelection(TextSelection.create(tr.doc, textStart))
        },
      }),
    ]
  },
})
