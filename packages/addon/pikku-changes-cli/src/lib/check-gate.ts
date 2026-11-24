import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { HarnessInfraError } from './finding.js'
import { runCli } from './run-cli.js'

/**
 * The check gate on `pikku changes done`. A change's commit is what a person goes back to, so it
 * has to pass `pikku check` (codegen and the typecheck): a change is done only when the tree is
 * committed and `pikku check` passes at HEAD. The refusal carries the errors so the agent fixes them
 * instead of parking the change. A repository with no pikku.config.json has nothing to check and
 * passes.
 *
 * `artifacts/compare/` (the compare reports and diff images `pikku ui pages compare` writes) is an
 * artifact kept in git (the images in LFS), but a change need not commit it: `done` writes a fresh
 * compare itself, so it does not make the tree dirty.
 */
/**
 * How a pikku CLI is run: an absolute executable and the arguments before the command, such as the
 * runtime and the CLI's script: `[process.execPath, process.argv[1]]` for the CLI that is running.
 */
export type PikkuCli = readonly [binary: string, ...args: string[]]

export type CheckRun = (args: {
  cwd: string
  cli: PikkuCli
  env: NodeJS.ProcessEnv
}) => Promise<{ code: number; output: string }>

/** The variables of `env` that are set, for a tool run on behalf of whoever runs the command. */
export const definedEnv = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )

/** `pikku check` in `cwd`; a run that could not finish is a failed check that says why. */
const run: CheckRun = async ({ cwd, cli: [binary, ...args], env }) => {
  try {
    await runCli([...args, 'check'], {
      cwd,
      binary,
      parse: () => [],
      okCodes: [0],
      timeoutMs: 600_000,
      env: definedEnv(env),
    })
    return { code: 0, output: '' }
  } catch (error) {
    if (!(error instanceof HarnessInfraError)) throw error
    return {
      code: error.exitCode ?? 1,
      output: error.output ?? error.message,
    }
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

/** Compare reports and diff images: kept in git, never required to be committed. */
export const COMPARE_OUTPUT_PATH = /^"?(?:.*\/)?artifacts\/compare\//

/** The `git status --porcelain` lines that are real uncommitted work. */
export const uncommitted = (porcelain: string): string[] =>
  porcelain
    .split('\n')
    .filter((line) => line.trim())
    .filter((line) => !COMPARE_OUTPUT_PATH.test(line.slice(3)))

export async function refuseUntilChecked({
  git,
  label,
  cli,
  env = process.env,
  check = run,
}: {
  git: (args: string[]) => Promise<string>
  label: string
  /** The pikku CLI that runs the check. */
  cli: PikkuCli
  /** What the check runs with: the environment of whoever runs `done`. */
  env?: NodeJS.ProcessEnv
  check?: CheckRun
}): Promise<void> {
  const top = (await git(['rev-parse', '--show-toplevel'])).trim()
  if (!top || !hasPikkuProject(top)) return
  if (uncommitted(await git(['status', '--porcelain', '-uall'])).length)
    throw new CloudPreconditionError(
      `${label} has uncommitted changes. Commit them first: done is judged on the commit, and \`pikku check\` runs on what is committed.`
    )
  const { code, output } = await check({ cwd: top, cli, env })
  if (code === 0) return
  const tail = output.trim().split('\n').slice(-30).join('\n')
  throw new CloudPreconditionError(
    `${label} does not pass \`pikku check\` at HEAD, so it is not done. Fix the errors below in this worktree, commit, and run done again. Do not park the change.\n\n${tail}`
  )
}
