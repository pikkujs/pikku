import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { dim, safe } from '@pikku/cli/addon-support'
import { changeRef, changesContext } from '../lib/changes.js'
import { LOCAL_PROJECT_ID, releaseChangeset } from '../lib/changes-local.js'
import { changesetSlug, changesetWorktrees } from '../lib/changeset-worktree.js'

export const ChangesReleaseInput = z.object({
  ref: z.string(),
})

export const ChangesReleaseOutput = z.object({
  groupId: z.string(),
  title: z.string(),
  open: z.array(z.string()),
  worktree: z.string().nullable(),
})

/**
 * Ends a changeset's lease now instead of when it runs out, for a builder
 * that stopped with work left: its changes are claimable again at once. The
 * worktree and branch stay, so whoever claims the group again
 * (`claim --group-id <group> --worktree`) carries on from the commits and
 * files left there. Local queue only.
 */
export const ChangesRelease = pikkuSessionlessFunc({
  description:
    'Give a changeset back to the queue before its lease runs out; its worktree and branch are kept.',
  input: ChangesReleaseInput,
  output: ChangesReleaseOutput,
  func: async (_services, input) => {
    const { rpc, projectId, storePath } = await changesContext(undefined)
    if (projectId !== LOCAL_PROJECT_ID)
      throw new CloudPreconditionError(
        'release works on the local changes queue; a cloud lease runs out on its own.'
      )
    const { groups } = await rpc.invoke('listChanges', {
      projectId,
      includeDone: true,
      pickupOnly: false,
    })
    const groupId =
      groups.find((g) => g.groupId === input.ref)?.groupId ??
      (
        await rpc
          .invoke('getChange', changeRef(projectId, input.ref))
          .catch(() => null)
      )?.change.groupId
    if (!groupId)
      throw new CloudPreconditionError(
        `${input.ref} is not a changeset or a change in one.`
      )
    await releaseChangeset(storePath, groupId)
    const {
      changes,
      groups: [group],
    } = await rpc.invoke('listChanges', {
      projectId,
      groupId,
      includeDone: true,
      pickupOnly: false,
    })
    const title = group?.title ?? ''
    const branch = `changeset/${changesetSlug(title)}`
    return {
      groupId,
      title,
      open: changes
        .filter((c) => c.status !== 'done' && c.status !== 'dismissed')
        .map((c) => c.shortId),
      worktree:
        (await changesetWorktrees()).find((w) => w.branch === branch)?.path ??
        null,
    }
  },
})

export const renderChangesRelease = (
  _s: unknown,
  result: z.infer<typeof ChangesReleaseOutput>
): void => {
  console.log(`Released “${safe(result.title)}”`)
  console.log(dim(`group ${safe(result.groupId)}`))
  if (result.open.length)
    console.log(
      `Claimable again: ${result.open.map((id) => `#${safe(id)}`).join(', ')}`
    )
  if (result.worktree)
    console.log(dim(`worktree kept: ${safe(result.worktree)}`))
}
