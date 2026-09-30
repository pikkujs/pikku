import type { WorkflowService } from '../../services/workflow-service.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'

type VersionStore = Pick<WorkflowService, 'upsertWorkflowVersion'>

const storedVersions = new WeakMap<VersionStore, Set<string>>()

/**
 * Persists the graph a run starts on, so a run suspended across a deploy that
 * changes the definition can still resume against the graph it began with.
 */
export const storeWorkflowVersion = async (
  service: VersionStore,
  name: string,
  graphHash: string
): Promise<void> => {
  const key = `${name}:${graphHash}`
  let stored = storedVersions.get(service)
  if (!stored) {
    stored = new Set()
    storedVersions.set(service, stored)
  }
  if (stored.has(key)) return
  const meta = resolveWorkflowMeta(name)?.meta
  if (!meta || meta.graphHash !== graphHash) return
  await service.upsertWorkflowVersion(name, graphHash, meta, meta.source)
  stored.add(key)
}
