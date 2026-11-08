import { execFile } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { PikkuCiFailedError } from './console-removal.js'

const run = promisify(execFile)

const git = async (cwd: string, ...args: string[]): Promise<string> => {
  const { stdout } = await run('git', args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

export type CiWorktree = { path: string; project: string }

/**
 * Everything a worktree cannot be made from. A tree with uncommitted work would
 * deploy something other than the commit, and an unignored `.deploy` would
 * leave the repo dirty once the output is copied back.
 */
export const assertWorktreeReady = async (rootDir: string) => {
  let top: string
  try {
    top = (await git(rootDir, 'rev-parse', '--show-toplevel')).trim()
  } catch {
    throw new PikkuCiFailedError(
      `pikku ci -p builds a clean checkout, so it needs a git repository, and ${rootDir} is not in one.`
    )
  }
  const dirty = (await git(top, 'status', '--porcelain')).trimEnd()
  if (dirty) {
    throw new PikkuCiFailedError(
      `pikku ci -p builds the commit, not your working tree. Commit or stash first:\n${dirty}`
    )
  }
  try {
    await git(rootDir, 'check-ignore', '-q', '.deploy')
  } catch {
    throw new PikkuCiFailedError(
      '.deploy is not gitignored, and pikku ci -p copies its output there. Add it to .gitignore.'
    )
  }
}

export const createWorktree = async (
  rootDir: string,
  parent = tmpdir()
): Promise<CiWorktree> => {
  const prefix = (await git(rootDir, 'rev-parse', '--show-prefix')).trim()
  // realpath: git records the resolved path, and macOS's tmpdir is a symlink.
  const path = mkdtempSync(join(realpathSync(resolve(parent)), 'pikku-ci-'))
  try {
    await git(rootDir, 'worktree', 'add', '--detach', path, 'HEAD')
  } catch (error) {
    rmSync(path, { recursive: true, force: true })
    throw error
  }
  return { path, project: join(path, prefix) }
}

/** Forced because the worktree is full of installs and build output by design. */
export const removeWorktree = async (rootDir: string, path: string) => {
  await git(rootDir, 'worktree', 'remove', '--force', path)
  rmSync(path, { recursive: true, force: true })
}
