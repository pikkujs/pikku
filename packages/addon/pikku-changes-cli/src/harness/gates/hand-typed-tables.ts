import type { Finding } from '../finding.js'
import type { HarnessGate } from '../gate.js'
import { gitIn } from '../git.js'

const HAND_TYPED = /withTables<|\.withTables\(/

const MESSAGE =
  'This types a table by hand. Declare the table with defineTables in db/tables.ts, run `pikku db generate` and `pikku db migrate`, and use the generated types.'

/** The lines a `git diff -U0` adds, with their file and line in the new version. */
export const addedLines = (
  diff: string
): { file: string; line: number; text: string }[] => {
  const added: { file: string; line: number; text: string }[] = []
  let file: string | undefined
  let line = 0
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ ')) {
      file =
        row === '+++ /dev/null' ? undefined : row.replace(/^\+\+\+ b\//, '')
      continue
    }
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (!file) continue
    if (row.startsWith('+'))
      added.push({ file, line: line++, text: row.slice(1) })
    else if (row.startsWith(' ')) line++
  }
  return added
}

/**
 * A changeset adds no hand-typed table (`withTables<...>()`, `.withTables(...)`): tables are declared with
 * defineTables in db/tables.ts, and their types are generated from the migrated database.
 */
export const handTypedTablesGate = (): HarnessGate => ({
  name: 'hand-typed-tables',
  description:
    'A changeset declares its tables in db/tables.ts instead of typing them by hand',
  failOn: 'high',
  writes: [],
  run: async (wire) => {
    const diff = await gitIn(wire.worktree)([
      'diff',
      '-U0',
      '--no-color',
      '--no-ext-diff',
      `${wire.base}...HEAD`,
    ])
    return addedLines(diff)
      .filter(({ text }) => HAND_TYPED.test(text))
      .map(({ file, line }): Finding => ({
        file,
        line,
        severity: 'high',
        rule: 'harness/hand-typed-tables',
        message: MESSAGE,
      }))
  },
})
