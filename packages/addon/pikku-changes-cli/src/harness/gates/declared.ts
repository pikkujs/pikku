import { localChangesRPC, localStorePath } from '../../lib/changes-local.js'

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
