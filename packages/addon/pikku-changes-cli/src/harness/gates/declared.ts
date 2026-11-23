import { localChangesRPC, localStorePath } from '../../lib/changes-local.js'

export type DeclaredChangeset = {
  creates: string[]
  alters: string[]
  needsPlan: boolean
  /** Every change of the changeset, with its status. */
  changes: { changeId: string; shortId: string; status: string }[]
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
  } as never)
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
    })),
  }
}
