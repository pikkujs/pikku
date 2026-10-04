import { runKnowledgeGaps } from '@pikku/knowledge'
import type { ChangesRPC } from './changes.js'

export async function openKnowledgeGaps(
  root: string,
  rpc: ChangesRPC,
  projectId: string
) {
  const list = await rpc.invoke('listChanges', {
    projectId,
    includeDone: true,
    pickupOnly: false,
    limit: 1000,
  })
  return runKnowledgeGaps(root, {
    filed: list.changes.map((c) => c.body ?? null),
  })
}
