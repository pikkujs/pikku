import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LocalCli, RunnerCommands } from './types.js'

export interface SelfCheckInput {
  commands: RunnerCommands
  cwd: string
  /** The CLI the runner and its agents use. */
  cliBin?: string
  localCli?: LocalCli
  /** The headless browser builders compare pages with; `false` when none is needed. */
  browser?: string | false
  strayIgnore?: string[]
  extraChecks?: () => Promise<string[]>
}

const runnable = (path: string) => {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
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

const LFS_RULES = ['png', 'jpg', 'jpeg', 'webp']
  .map((ext) => `artifacts/**/*.${ext} filter=lfs diff=lfs merge=lfs -text`)
  .join('\n')

/**
 * What the runner needs, checked before its first fill, every problem listed
 * at once: the CLI, a git identity for merge commits, a headless browser for
 * page work, artifact images in LFS (the rule is added to .gitattributes and
 * committed when it is missing), a main checkout with nothing uncommitted,
 * and whatever the host checks besides. `done` says what it fixed.
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
  if (input.browser !== false) {
    if (!input.browser)
      problems.push(
        'No headless browser: set PLAYWRIGHT_CHROMIUM_PATH (or PIKKU_CHROMIUM) to a Chromium binary. Agents capture and compare pages with it.'
      )
    else if (!runnable(input.browser))
      problems.push(
        `The headless browser ${input.browser} is not an executable file.`
      )
  }
  const lfs = await commands.git(cwd, [
    'check-attr',
    'filter',
    '--',
    'artifacts/compare/x.png',
  ])
  if (!/filter: lfs/.test(lfs.output)) {
    if ((await commands.git(cwd, ['lfs', 'version'])).code)
      problems.push(
        'git-lfs is not installed: the artifacts (reference screenshots, compare diffs) are kept in LFS. Install git-lfs.'
      )
    else {
      const attributes = join(cwd, '.gitattributes')
      const before = existsSync(attributes)
        ? readFileSync(attributes, 'utf8')
        : ''
      await writeFile(
        attributes,
        `${before}${before && !before.endsWith('\n') ? '\n' : ''}${LFS_RULES}\n`
      )
      await commands.git(cwd, ['lfs', 'install', '--local'])
      const added = await commands.git(cwd, ['add', '.gitattributes'])
      const committed = added.code
        ? added
        : await commands.git(cwd, [
            'commit',
            '-q',
            '-m',
            'Keep artifact images in LFS',
            '--',
            '.gitattributes',
          ])
      if (committed.code)
        problems.push(
          `artifact images were not tracked in LFS. The rule was added to .gitattributes, but the commit failed: ${committed.output.split('\n').slice(-2).join(' ')}`
        )
      else
        done.push(
          'artifact images (reference screenshots, compare diffs) were not tracked in LFS: the rule was added to .gitattributes and committed.'
        )
    }
  }
  const stray = await strayFiles(commands, cwd, input.strayIgnore)
  if (stray.length)
    problems.push(
      `The main checkout has uncommitted files a changeset worktree would not have, and a merge bringing them would collide with: ${stray.slice(0, 10).join(', ')}${stray.length > 10 ? ` and ${stray.length - 10} more` : ''}. Commit them, ignore them in .gitignore, or remove them.`
    )
  if (input.extraChecks) problems.push(...(await input.extraChecks()))
  return { problems, done }
}
