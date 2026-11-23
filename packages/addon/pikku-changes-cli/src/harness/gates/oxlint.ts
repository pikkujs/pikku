import type { HarnessGate } from '../gate.js'
import { parseOxlint } from './oxlint-parser.js'

/**
 * oxlint over the worktree, read-only. Exit 0 is the only ok code: oxlint exits 1 when it reports
 * an error, which the findings explain, and also when it found no files, which then throws.
 */
export const oxlintGate = ({
  binary,
  paths = ['.'],
  timeoutMs = 120_000,
}: {
  binary: string
  paths?: string[]
  timeoutMs?: number
}): HarnessGate => ({
  name: 'oxlint',
  description: 'Lints the changeset with oxlint',
  failOn: 'high',
  writes: [],
  run: (wire) =>
    wire.runCli(['--format=json', ...paths], {
      binary,
      parse: parseOxlint,
      okCodes: [0],
      timeoutMs,
    }),
})
