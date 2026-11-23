import type { GateWire, HarnessGate } from '../gate.js'
import { changedFiles } from './changed.js'
import { parseOxfmtListDifferent, parseOxfmtWrite } from './oxfmt-parser.js'

const TARGETS = ['**/*.{ts,tsx}']
const SOURCES = [':(glob)**/*.ts', ':(glob)**/*.tsx']

/**
 * The formatter fixer: `oxfmt --write` over TypeScript sources only, so it stays inside its
 * `writes`. An unmatched pattern is not an error (a changeset may have no .tsx). oxfmt exits 2 on a
 * file it cannot parse, which throws; the check gate reports the syntax error itself. With
 * `changedOnly` it formats only the sources the changeset changed, so files it never touched are
 * left as the base branch has them; with none changed it does nothing.
 */
export const oxfmtGate = ({
  binary,
  timeoutMs = 120_000,
  changedOnly = false,
}: {
  binary: string
  timeoutMs?: number
  changedOnly?: boolean
}): HarnessGate => {
  const targets = async (wire: GateWire) =>
    changedOnly ? changedFiles(wire.worktree, wire.base, SOURCES) : TARGETS
  return {
    name: 'oxfmt',
    description: 'Formats TypeScript sources with oxfmt',
    stage: 'fixer',
    failOn: 'medium',
    writes: ['**/*.{ts,tsx}'],
    run: async (wire) => {
      const files = await targets(wire)
      if (!files.length) return []
      return wire.runCli(
        ['--write', '--no-error-on-unmatched-pattern', ...files],
        {
          binary,
          parse: parseOxfmtWrite,
          okCodes: [0],
          timeoutMs,
        }
      )
    },
    check: async (wire) => {
      const files = await targets(wire)
      if (!files.length) return []
      return wire.runCli(
        ['--list-different', '--no-error-on-unmatched-pattern', ...files],
        {
          binary,
          parse: parseOxfmtListDifferent,
          okCodes: [0],
          timeoutMs,
        }
      )
    },
  }
}
