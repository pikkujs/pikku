import { existsSync } from 'node:fs'
import type { LocalCli, RunnerCommands } from './types.js'

/** What a host check reports: problems, and the things it fixed on its own. */
export type ExtraChecks = string[] | { problems: string[]; done: string[] }

export interface SelfCheckInput {
  commands: RunnerCommands
  cwd: string
  /** The CLI the runner and its agents use. */
  cliBin?: string
  localCli?: LocalCli
  strayIgnore?: string[]
  extraChecks?: () => Promise<ExtraChecks>
}

/** Uncommitted files in the main checkout (untracked and not ignored, or changed): a worktree cut from HEAD would not have them, and a merge bringing them collides. */
export const strayFiles = async (
  commands: RunnerCommands,
  cwd: string,
  ignore: string[] = []
): Promise<string[]> =>
  (
    await commands.git(cwd, ['status', '--porcelain', '--untracked-files=all'])
  ).output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter(
      (path) => !ignore.some((p) => path === p || path.startsWith(`${p}/`))
    )

/**
 * What the runner needs, checked before its first fill, every problem listed
 * at once: the CLI, a git identity for merge commits, a main checkout with
 * nothing uncommitted, and whatever the host checks besides (a model login, a
 * browser, repository settings). `done` says what a check fixed.
 */
export const selfCheck = async (
  input: SelfCheckInput
): Promise<{ problems: string[]; done: string[] }> => {
  const { commands, cwd } = input
  const problems: string[] = []
  const done: string[] = []
  const bin = input.localCli?.bin ?? input.cliBin
  if (bin && !existsSync(bin))
    problems.push(
      `The pikku CLI ${bin} does not exist. Build the CLI or fix the path.`
    )
  if (!(await commands.git(cwd, ['config', 'user.email'])).output)
    problems.push(
      `The project has no git identity, so the runner cannot commit a merge. Set one: git -C ${cwd} config user.email <email> and git -C ${cwd} config user.name <name>.`
    )
  const stray = await strayFiles(commands, cwd, input.strayIgnore)
  if (stray.length)
    problems.push(
      `The main checkout has uncommitted files a changeset worktree would not have, and a merge bringing them would collide with: ${stray.slice(0, 10).join(', ')}${stray.length > 10 ? ` and ${stray.length - 10} more` : ''}. Commit them, ignore them in .gitignore, or remove them.`
    )
  if (input.extraChecks) {
    const extra = await input.extraChecks()
    if (Array.isArray(extra)) problems.push(...extra)
    else {
      problems.push(...extra.problems)
      done.push(...extra.done)
    }
  }
  return { problems, done }
}
