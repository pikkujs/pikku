import type { Finding } from '../finding.js'
import type { HarnessGate } from '../gate.js'
import { changedFiles } from './changed.js'
import { parseOxlint } from './oxlint-parser.js'

/** oxlint's config files: a changeset may not change what its own lint run is judged by. */
const LINT_CONFIG = [
  ':(glob).oxlintrc.json',
  ':(glob)**/.oxlintrc.json',
  ':(glob)oxlint.config.*',
  ':(glob)**/oxlint.config.*',
]

/** The lint config files the changeset's commits change against the base branch. */
const changedLintConfig = async (
  worktree: string,
  base: string
): Promise<Finding[]> =>
  (await changedFiles(worktree, base, LINT_CONFIG)).map((file) => ({
    file,
    severity: 'high' as const,
    rule: 'harness/lint-config',
    message: `the changeset changes the lint config ${file}; lint is judged by the config on ${base}, so revert this change`,
  }))

/**
 * oxlint over the worktree, read-only. Exit 0 is the only ok code: oxlint exits 1 when it reports
 * an error, which the findings explain, and also when it found no files, which then throws. A
 * changeset that changes an oxlint config fails the gate, so the thresholds stay the base branch's.
 * With `changedOnly` the whole tree is still linted (so the project's own ignore rules apply) but
 * only findings in files the changeset changed count: what was already wrong on the base branch is
 * not the changeset's to fix.
 */
export const oxlintGate = ({
  binary,
  paths = ['.'],
  timeoutMs = 120_000,
  changedOnly = false,
}: {
  binary: string
  paths?: string[]
  timeoutMs?: number
  changedOnly?: boolean
}): HarnessGate => ({
  name: 'oxlint',
  description: 'Lints the changeset with oxlint',
  failOn: 'high',
  writes: [],
  run: async (wire) => {
    const config = await changedLintConfig(wire.worktree, wire.base)
    const findings = await wire.runCli(['--format=json', ...paths], {
      binary,
      parse: parseOxlint,
      okCodes: [0],
      timeoutMs,
    })
    if (!changedOnly) return [...config, ...findings]
    const changed = new Set(await changedFiles(wire.worktree, wire.base))
    return [
      ...config,
      ...findings.filter(
        (finding) =>
          finding.file !== undefined &&
          changed.has(finding.file.replace(/^\.\//, ''))
      ),
    ]
  },
})
