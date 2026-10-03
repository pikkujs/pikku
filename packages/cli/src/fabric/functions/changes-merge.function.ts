import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changesContext, requireProjectId } from '../lib/changes.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { currentBranch, git, isAncestor } from '../../utils/git.js'
import { dim, safe } from '../lib/output.js'
import { releaseChangeset } from '../lib/changes-local.js'

export const FabricChangesMergeInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  groupId: z.string(),
})

export const FabricChangesMergeOutput = z.object({
  groupId: z.string(),
  branch: z.string(),
  into: z.string(),
  commit: z.string(),
  removedWorktree: z.string().nullable(),
})

/**
 * The branch comes from the changes themselves — `done` recorded where each
 * one landed — so the merge is refused until every change in the set is done
 * on one branch.
 */
export const FabricChangesMerge = pikkuSessionlessFunc({
  description:
    'Merge a finished changeset into this branch as one --no-ff commit with a Changeset trailer.',
  input: FabricChangesMergeInput,
  output: FabricChangesMergeOutput,
  func: async (_services, input) => {
    const { rpc, projectId, storePath } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    const { changes, groups } = await rpc.invoke('listChanges', {
      projectId: requireProjectId(projectId),
      groupId: input.groupId,
      includeDone: true,
    })
    const group = groups.find((g) => g.groupId === input.groupId)
    if (!group || !changes.length)
      throw new FabricPreconditionError(`No changeset ${input.groupId}.`)
    const open = changes.filter((c) => c.status !== 'done')
    if (open.length)
      throw new FabricPreconditionError(
        `Not done yet: ${open.map((c) => `#${c.shortId}`).join(', ')}.`
      )
    const branches = [...new Set(changes.map((c) => c.branch))]
    const branch = branches[0]
    if (branches.length !== 1 || !branch)
      throw new FabricPreconditionError(
        `The changes in this set landed on ${branches.map((b) => b ?? 'no branch').join(', ')}; a changeset is one branch.`
      )
    const into = await currentBranch()
    if (into === branch)
      throw new FabricPreconditionError(
        `This checkout is on ${branch} itself. Run merge from the branch it goes into.`
      )
    if (await isAncestor(branch, 'HEAD')) {
      if (storePath) await releaseChangeset(storePath, group.groupId)
      throw new FabricPreconditionError(
        `${branch} is already in ${into} — merged by plain git, so there is no Changeset commit for “${group.title}”. Leave it as it is; next time let \`changes merge\` do the merge.`
      )
    }
    await git([
      'merge',
      '--no-ff',
      branch,
      '-m',
      group.title,
      '-m',
      `Changeset: ${group.groupId}`,
    ])
    if (storePath) await releaseChangeset(storePath, group.groupId)
    const worktree = (await git(['worktree', 'list', '--porcelain']))
      .split('\n\n')
      .find((entry) => entry.includes(`\nbranch refs/heads/${branch}`))
      ?.match(/^worktree (.+)$/m)?.[1]
    if (worktree) await git(['worktree', 'remove', worktree])
    return {
      groupId: group.groupId,
      branch,
      into,
      commit: (await git(['rev-parse', 'HEAD'])).trim(),
      removedWorktree: worktree ?? null,
    }
  },
})

export const renderChangesMerge = (
  _s: unknown,
  result: z.infer<typeof FabricChangesMergeOutput>
): void => {
  console.log(
    `Merged ${safe(result.branch)} into ${safe(result.into)} @ ${result.commit.slice(0, 7)}`
  )
  if (result.removedWorktree)
    console.log(dim(`removed worktree ${safe(result.removedWorktree)}`))
}
