import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

/**
 * Resolve a stage UUID from (projectId, branch) via the `listStages` RPC.
 * The stageId-based read RPCs (listDeployments, listDeploymentWorkers,
 * getStageDatabaseSchema) need a UUID, but the CLI only knows the branch.
 */
export async function resolveStageId(
  rpc: PikkuRPC,
  projectId: string,
  branch: string
): Promise<string> {
  const { stages } = await rpc.invoke('listStages', { projectId })
  const stage = stages.find((s) => s.branch === branch)
  if (!stage) {
    const known = stages.map((s) => s.branch).join(', ')
    throw new Error(
      `No stage for branch "${branch}".${known ? ` Existing: ${known}` : ''}`
    )
  }
  return stage.stageId
}
