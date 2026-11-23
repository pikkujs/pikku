import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gitIn } from './git.js'

const SHA = /^[0-9a-f]{40,64}$/

/**
 * The commit a changeset's worktree was cut from and the branch it merges into, kept in
 * `<git-dir>/pikku-harness/base` and `target`. Recorded on first use (the merge-base of the worktree's
 * HEAD and `target`, which for a fresh worktree is its HEAD) and read back on every later run of the
 * worktree, so the gates judge the changeset against the same commit however far the target has moved.
 */
export const harnessBase = async (
  worktree: string,
  target: string,
  gitBinary?: string
): Promise<{ base: string; target: string }> => {
  const git = gitIn(worktree, gitBinary)
  const home = join(
    (await git(['rev-parse', '--absolute-git-dir'])).trim(),
    'pikku-harness'
  )
  const read = (name: string) =>
    readFile(join(home, name), 'utf8').then(
      (text) => text.trim(),
      () => ''
    )
  const [base, kept] = [await read('base'), await read('target')]
  if (SHA.test(base) && kept) return { base, target: kept }
  const cut = (await git(['merge-base', 'HEAD', target])).trim()
  await mkdir(home, { recursive: true })
  await writeFile(join(home, 'base'), `${cut}\n`)
  await writeFile(join(home, 'target'), `${target}\n`)
  return { base: cut, target }
}

/** The branch a checkout is on, or undefined on a detached HEAD. */
export const checkoutBranch = async (
  cwd: string,
  gitBinary?: string
): Promise<string | undefined> => {
  const branch = (
    await gitIn(cwd, gitBinary)(['rev-parse', '--abbrev-ref', 'HEAD'])
  ).trim()
  return branch && branch !== 'HEAD' ? branch : undefined
}

export const DETACHED_HEAD =
  'The project checkout is on a detached HEAD; check out the branch the changes should merge into.'
