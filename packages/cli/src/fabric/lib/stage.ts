import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

export interface ResolvedStage {
  stageId: string
  branch: string
}

/**
 * Resolve a stage from (projectId, branch) via the `listStages` RPC. The
 * stageId-based read RPCs (listDeployments, listDeploymentWorkers,
 * getStageDatabaseSchema) need a UUID, but the CLI only knows the branch.
 *
 * `branch` is optional because it is optional in practice: nothing upstream
 * guarantees the flag was passed, and interpolating what arrived produced
 * `No stage for branch "undefined"` — an error naming the missing argument's
 * value rather than saying the argument is missing, directly above a line
 * listing the one stage it could have used. With exactly one stage there is
 * nothing to disambiguate, so that stage is the answer.
 *
 * The branch comes back with the id so callers can name the stage they acted
 * on rather than echoing the argument, which is `undefined` in exactly the
 * case this function exists to handle.
 */
export async function resolveStage(
  rpc: PikkuRPC,
  projectId: string,
  branch: string | undefined
): Promise<ResolvedStage> {
  const { stages } = await rpc.invoke('listStages', { projectId })
  const known = stages.map((s) => s.branch)

  if (!branch) {
    const only = stages[0]
    if (stages.length === 1 && only) {
      return { stageId: only.stageId, branch: only.branch }
    }
    throw new Error(
      stages.length === 0
        ? 'No stages deployed for this project yet — run `pikku fabric deploy apply --branch <branch>` first.'
        : `--branch is required — this project has ${stages.length} stages: ${known.join(', ')}`
    )
  }

  const stage = stages.find((s) => s.branch === branch)
  if (!stage) {
    throw new Error(
      `No stage for branch "${branch}".${known.length ? ` Existing: ${known.join(', ')}` : ''}`
    )
  }
  return { stageId: stage.stageId, branch: stage.branch }
}

export async function resolveStageId(
  rpc: PikkuRPC,
  projectId: string,
  branch: string | undefined
): Promise<string> {
  return (await resolveStage(rpc, projectId, branch)).stageId
}
