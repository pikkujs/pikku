import { gitIn } from '../git.js'

/**
 * The files the changeset's commits add or change against the base branch (`base...HEAD`), as
 * repository paths, limited to the given pathspecs. Deleted files are left out.
 */
export const changedFiles = async (
  worktree: string,
  base: string,
  pathspecs: string[] = []
): Promise<string[]> =>
  (
    await gitIn(worktree)([
      'diff',
      '--name-only',
      '--diff-filter=d',
      `${base}...HEAD`,
      '--',
      ...pathspecs,
    ])
  )
    .split('\n')
    .filter(Boolean)
