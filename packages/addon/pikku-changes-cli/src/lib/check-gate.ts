import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

/**
 * The check gate on `pikku changes done`. A change's commit is what a person goes back to, so it
 * has to pass `pikku check` (codegen and the typecheck): a change is done only when the tree is
 * committed and `pikku check` passes at HEAD. The refusal carries the errors so the agent fixes them
 * instead of parking the change. PIKKU_CHANGES_CHECK_GATE=off turns it off, except for a builder
 * (PIKKU_CHANGES_BUILDER=1), which cannot turn off its own gate; a repository with no
 * pikku.config.json has nothing to check and passes.
 *
 * `artifacts/tmp/` (the compare reports and diff images `pikku ui pages compare` writes) is
 * scratch: it is not part of the commit and does not make the tree dirty.
 */
export type CheckRun = (cwd: string) => { code: number; output: string }

const run: CheckRun = (cwd) => {
  const bin = process.env.PIKKU_CLI_BIN ?? process.argv[1]!
  const result = spawnSync(process.execPath, [bin, 'check'], {
    cwd,
    encoding: 'utf8',
    timeout: 600_000,
    env: { ...process.env, PIKKU_NO_LOGO: '1' },
    maxBuffer: 32 * 1024 * 1024,
  })
  return {
    code: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  }
}

/** A project is a folder with a pikku.config.json at its root or one level down (packages/functions). */
export const hasPikkuProject = (top: string): boolean => {
  if (existsSync(join(top, 'pikku.config.json'))) return true
  for (const dir of ['packages', 'apps']) {
    try {
      for (const entry of readdirSync(join(top, dir))) {
        if (existsSync(join(top, dir, entry, 'pikku.config.json'))) return true
      }
    } catch {
      // no such folder
    }
  }
  return false
}

/** Scratch output that is never committed: compare reports and diff images. */
export const SCRATCH_PATH = /^"?(?:.*\/)?artifacts\/tmp\//

/** The `git status --porcelain` lines that are real uncommitted work. */
export const uncommitted = (porcelain: string): string[] =>
  porcelain
    .split('\n')
    .filter((line) => line.trim())
    .filter((line) => !SCRATCH_PATH.test(line.slice(3)))

export async function refuseUntilChecked({
  git,
  label,
  check = run,
}: {
  git: (args: string[]) => Promise<string>
  label: string
  check?: CheckRun
}): Promise<void> {
  // a builder (PIKKU_CHANGES_BUILDER=1) cannot switch the gate off for itself
  if (
    process.env.PIKKU_CHANGES_CHECK_GATE === 'off' &&
    process.env.PIKKU_CHANGES_BUILDER !== '1'
  )
    return
  const top = (await git(['rev-parse', '--show-toplevel'])).trim()
  if (!top || !hasPikkuProject(top)) return
  if (uncommitted(await git(['status', '--porcelain', '-uall'])).length)
    throw new CloudPreconditionError(
      `${label} has uncommitted changes. Commit them first: done is judged on the commit, and \`pikku check\` runs on what is committed.`
    )
  const { code, output } = check(top)
  if (code === 0) return
  const tail = output.trim().split('\n').slice(-30).join('\n')
  throw new CloudPreconditionError(
    `${label} does not pass \`pikku check\` at HEAD, so it is not done. Fix the errors below in this worktree, commit, and run done again. Do not park the change.\n\n${tail}`
  )
}
