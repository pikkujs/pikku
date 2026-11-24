import { pikkuHarnessGate } from '@pikku/core/harness'
import { localChangesRPC, localStorePath } from '../lib/changes-local.js'
import type { Finding } from './finding.js'
import { changesetRun } from './gates/declared.js'
import { gitIn } from './git.js'
import type { HarnessItem } from './prompts.js'

const bare = (shortId: string) => shortId.replace(/^#/, '')

/**
 * The newest commit in `range` whose message carries the item's trailer (`Change-Id: <id>`, or the
 * short id), found the way `pikku changes done` finds it. Empty when there is none.
 */
export const changeCommit = async (
  worktree: string,
  item: HarnessItem,
  range: string[] = [],
  gitBinary?: string
): Promise<string> => {
  const git = gitIn(worktree, gitBinary)
  const sha = (
    await git([
      'log',
      '-1',
      '--format=%H',
      '-E',
      `--grep=^Change(-Id)?: (${item.changeId}|#?${bare(item.shortId)})$`,
      ...range,
    ])
  ).trim()
  if (!sha) return ''
  const trailer = (await git(['log', '-1', '--format=%B', sha])).match(
    /^Change(?:-Id)?: #?(\S+)\s*$/m
  )?.[1]
  return trailer === item.changeId || trailer === bare(item.shortId) ? sha : ''
}

/**
 * Every item the run builds has a commit on its branch carrying its trailer: what `done` will
 * record. A missing one goes back to the agent, which can still commit it.
 */
export const trailerGate = pikkuHarnessGate({
  name: 'trailers',
  description:
    'Each item of the changeset has a commit with its Change-Id trailer',
  failOn: 'high',
  writes: [],
  func: async (_services, _data, { gate }) => {
    const { items } = changesetRun(gate)
    const findings: Finding[] = []
    for (const item of items)
      if (!(await changeCommit(gate.worktree, item, [`${gate.base}..HEAD`])))
        findings.push({
          severity: 'high',
          rule: 'harness/trailer',
          message: `no commit on this branch is #${bare(item.shortId)}: commit it with #${bare(item.shortId)} in the subject and a \`Change-Id: ${item.changeId}\` trailer`,
        })
    return findings
  },
})

/**
 * Records an item done on the local changes queue, with the branch and the commit that carries its
 * trailer, as `pikku changes done` records it. The gates have already passed, so `done`'s own gates
 * are not run again. Throws when no commit carries the trailer.
 */
export const recordChangeDone = async ({
  worktree,
  item,
  storePath,
  authorName = 'pikku-harness',
  gitBinary,
}: {
  worktree: string
  item: HarnessItem
  /** The queue file; defaults to the one the CLI uses for this checkout. */
  storePath?: string
  authorName?: string
  gitBinary?: string
}): Promise<{ headCommit: string; branch?: string }> => {
  const headCommit = await changeCommit(worktree, item, [], gitBinary)
  if (!headCommit)
    throw new Error(
      `No commit on this branch is #${bare(item.shortId)}, so it cannot be recorded done`
    )
  const head = (
    await gitIn(worktree, gitBinary)(['rev-parse', '--abbrev-ref', 'HEAD'])
  ).trim()
  const branch = head && head !== 'HEAD' ? head : undefined
  const rpc = localChangesRPC(storePath ?? (await localStorePath(worktree)))
  await rpc.invoke('completeChange', {
    changeId: item.changeId,
    branch,
    headCommit,
    authorName,
  })
  return { headCommit, ...(branch ? { branch } : {}) }
}
