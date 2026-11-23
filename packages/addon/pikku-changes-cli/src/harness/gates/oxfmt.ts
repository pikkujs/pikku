import type { HarnessGate } from '../gate.js'
import { parseOxfmtListDifferent, parseOxfmtWrite } from './oxfmt-parser.js'

const TARGETS = ['**/*.{ts,tsx}']

/**
 * The formatter fixer: `oxfmt --write` over TypeScript sources only, so it stays inside its
 * `writes`. An unmatched pattern is not an error (a changeset may have no .tsx). oxfmt exits 2 on a
 * file it cannot parse, which throws; the check gate reports the syntax error itself.
 */
export const oxfmtGate = ({
  binary,
  timeoutMs = 120_000,
}: {
  binary: string
  timeoutMs?: number
}): HarnessGate => ({
  name: 'oxfmt',
  description: 'Formats TypeScript sources with oxfmt',
  failOn: 'medium',
  writes: ['**/*.{ts,tsx}'],
  run: (wire) =>
    wire.runCli(['--write', '--no-error-on-unmatched-pattern', ...TARGETS], {
      binary,
      parse: parseOxfmtWrite,
      okCodes: [0],
      timeoutMs,
    }),
  check: (wire) =>
    wire.runCli(
      ['--list-different', '--no-error-on-unmatched-pattern', ...TARGETS],
      {
        binary,
        parse: parseOxfmtListDifferent,
        okCodes: [0],
        timeoutMs,
      }
    ),
})
