import { pikkuHarnessGate } from '@pikku/core/harness'
import { changedFiles } from './changed.js'
import { parseOxfmtWrite } from './oxfmt-parser.js'

const SOURCES = [':(glob)**/*.ts', ':(glob)**/*.tsx']

/**
 * The formatter fixer: `oxfmt --write` with the run's pinned oxfmt over the TypeScript sources the
 * changeset changed, so it stays inside its `writes` and leaves files it never touched as the base
 * branch has them; with none changed it does nothing. An unmatched pattern is not an error (a
 * changeset may have no .tsx). oxfmt exits 2 on a file it cannot parse, which throws; the check
 * gate reports the syntax error itself. Run again after its commit it changes nothing.
 */
export const oxfmtGate = pikkuHarnessGate({
  name: 'oxfmt',
  description:
    'Formats the TypeScript sources the changeset changed with oxfmt',
  failOn: 'medium',
  writes: ['**/*.{ts,tsx}'],
  func: async (_services, _data, { gate }) => {
    const files = await changedFiles(gate.worktree, gate.base, SOURCES)
    if (!files.length) return []
    return gate.runCli(
      ['--write', '--no-error-on-unmatched-pattern', ...files],
      {
        binary: gate.tool('oxfmt'),
        parse: parseOxfmtWrite,
        okCodes: [0],
        timeoutMs: 120_000,
      }
    )
  },
})
