// 初回起動時に作る説明用ドキュメント
export const WELCOME_MARKDOWN = `# Welcome to sugumd

Write Markdown and it turns into formatted text as you type. Everything is saved in this browser automatically.

## Writing

- Start a line with \`# \` for a heading, \`- \` for a bullet, \`1. \` for a numbered list
- \`- [ ] \` or \`[] \` for a to-do, \`> \` for a quote, \`\`\`\` \`\`\` \`\`\`\` for a code block
- Wrap text in \`**\` for **bold** and \`*\` for *italic*
- Select some text and paste a URL to turn it into a link

## Slash commands

Type \`/\` anywhere to open the command menu.

| Type | What it does |
| --- | --- |
| /table | Pick the number of rows and columns from a grid |
| /3x4 | Insert a 3 × 4 table right away |
| /toggle | A collapsible section |
| /callout | A colored note box (Note, Tip, Important, Warning, Caution) |
| /mermaid | A Mermaid diagram with a live preview |

Hover over a table to get **+** buttons for adding rows and columns.

## Finding things

- \`Ctrl + K\` (\`Cmd + K\` on Mac) to jump to any document
- \`Ctrl + F\` to find and replace within this document
- Hover a heading in the outline on the right and click **Copy** to copy just that section
- **☑ To-dos** in the sidebar collects every open to-do across your documents

## Saving and copying

- **Copy all** puts the whole document on the clipboard, ready to paste into Notion
- The **…** menu has *Copy for Slack*, Markdown download and backups
- In Chrome or Edge, **… → Also save to a folder** keeps a \`.md\` file per document in a folder you choose
`
