import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gitIn } from './git.js'

const EPOCH = /^[A-Za-z0-9]{1,32}$/

/**
 * The epoch of a worktree's Pi sessions, kept in `<git-dir>/pikku-harness/epoch`. It is made on first
 * use and lives as long as the worktree's git dir, so every run of a changeset in the same worktree
 * (a retry after a provider limit, a restart) resumes the same session, and a new worktree for the
 * same changeset starts a new one.
 */
export const harnessEpoch = async (
  worktree: string,
  gitBinary?: string
): Promise<string> => {
  const home = join(
    (
      await gitIn(worktree, gitBinary)(['rev-parse', '--absolute-git-dir'])
    ).trim(),
    'pikku-harness'
  )
  const path = join(home, 'epoch')
  const read = async () => (await readFile(path, 'utf8')).trim()
  try {
    const kept = await read()
    if (EPOCH.test(kept)) return kept
    throw new Error(`${path} does not hold an epoch: ${kept.slice(0, 40)}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await mkdir(home, { recursive: true })
  try {
    await writeFile(path, `${randomBytes(6).toString('hex')}\n`, { flag: 'wx' })
  } catch (error) {
    // Another run made it first: its epoch is the one.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  return read()
}
