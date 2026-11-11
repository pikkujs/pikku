import { runKnowledgeGaps } from '@pikku/knowledge'
import type { ChangesRPC } from './changes-local.js'
import { LIST_CHANGES_MAX } from './list-limit.js'

export async function openKnowledgeGaps(
  root: string,
  rpc: ChangesRPC,
  projectId: string
) {
  const list = await rpc.invoke('listChanges', {
    projectId,
    includeDone: true,
    pickupOnly: false,
    limit: LIST_CHANGES_MAX,
  })
  return runKnowledgeGaps(root, {
    filed: list.changes.map((c) => c.body ?? null),
  })
}
