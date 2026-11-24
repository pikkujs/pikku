import type { PikkuHarnessGateWire } from '@pikku/core/harness'
import { z } from 'zod'
import { localChangesRPC, localStorePath } from '../../lib/changes-local.js'
import { HarnessInfraError } from '../finding.js'
import type { HarnessItem } from '../prompts.js'

/** The part of a harness run's input the changes gates read: Studio starts a run with it. */
const ChangesetRun = z.object({
  changeset: z.object({ id: z.string().min(1) }),
  items: z
    .array(z.object({ shortId: z.string(), changeId: z.string() }))
    .min(1),
  /** The changes queue file when the project keeps it outside the checkout's git dir. */
  storePath: z.string().optional(),
})

export type ChangesetRun = {
  changeset: string
  items: HarnessItem[]
  storePath?: string
}

/**
 * The changeset a harness run builds, read from what the run was started with. A run started
 * without one cannot be judged by a gate that needs it, which is said as `precondition`.
 */
export const changesetRun = (gate: PikkuHarnessGateWire): ChangesetRun => {
  const read = ChangesetRun.safeParse(gate.input)
  if (!read.success)
    throw new HarnessInfraError(
      'precondition',
      `The harness run was not started with a changeset (changeset.id and its items): ${read.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; ')}`
    )
  const { changeset, items, storePath } = read.data
  return {
    changeset: changeset.id,
    items,
    ...(storePath === undefined ? {} : { storePath }),
  }
}

export type DeclaredChangeset = {
  creates: string[]
  alters: string[]
  needsPlan: boolean
  /** Every change of the changeset, with its status and the text it was filed with. */
  changes: {
    changeId: string
    shortId: string
    status: string
    title: string
    body: string | null
    specialist: string | null
  }[]
}

/**
 * What a changeset declared on the local changes queue (`claim --creates/--alters`, a plan it
 * needs) and its changes, read from the queue file the CLI uses for this checkout unless one is given.
 */
export const declaredChangeset = async (
  worktree: string,
  groupId: string,
  storePath?: string
): Promise<DeclaredChangeset> => {
  const rpc = localChangesRPC(storePath ?? (await localStorePath(worktree)))
  const { groups, changes } = await rpc.invoke('listChanges', {
    projectId: 'local',
    groupId,
    includeDone: true,
  })
  const group = groups.find((g) => g.groupId === groupId) as
    { creates?: string[]; alters?: string[]; needsPlan?: boolean } | undefined
  return {
    creates: group?.creates ?? [],
    alters: group?.alters ?? [],
    needsPlan: group?.needsPlan ?? false,
    changes: changes.map((c) => ({
      changeId: c.changeId,
      shortId: String(c.shortId),
      status: c.status,
      title: c.title,
      body: c.body ?? null,
      specialist: (c as { specialist?: string | null }).specialist ?? null,
    })),
  }
}
