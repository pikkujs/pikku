import { HarnessInfraError } from './finding.js'
import { gitIn } from './git.js'

export type FixCommit = {
  /** Gate name, the scope of the subject. */
  gate: string
  /** Short id of the item the commit belongs to (the last item of the changeset). */
  shortId: string
  /** Change id of that item, for the `Change-Id:` trailer. */
  changeId: string
  /** The changeset the branch builds, for the `Changeset:` reference. */
  changeset: string
  message: string
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export const fixCommitMessage = ({
  gate,
  shortId,
  changeId,
  changeset,
  message,
}: FixCommit): string =>
  `style(${oneLine(gate)}): #${oneLine(shortId).replace(/^#/, '')} ${oneLine(message)}\n\nChange-Id: ${oneLine(changeId)}\nChangeset: ${oneLine(changeset)}\n`

/**
 * Commits what a fixer gate changed as its own commit. `paths` (as returned by the write guard) are
 * staged first; with nothing staged the commit is refused.
 */
export const commitFixes = async ({
  worktree,
  paths = [],
  gitBinary,
  ...commit
}: FixCommit & {
  worktree: string
  paths?: string[]
  gitBinary?: string
}): Promise<string> => {
  const git = gitIn(worktree, gitBinary)
  if (paths.length) await git(['add', '-A', '--', ...paths])
  const staged = (await git(['diff', '--cached', '--name-only', '-z'])).trim()
  if (!staged)
    throw new HarnessInfraError(
      'empty-commit',
      `Gate ${commit.gate} has nothing staged to commit`
    )
  await git(
    ['commit', '--no-verify', '-q', '-F', '-'],
    fixCommitMessage(commit)
  )
  return (await git(['rev-parse', 'HEAD'])).trim()
}
