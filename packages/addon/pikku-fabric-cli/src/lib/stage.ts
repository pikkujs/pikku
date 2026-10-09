import type { ChangesRPC } from './changes-local.js'
import { FabricPreconditionError } from './errors.js'

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
  rpc: ChangesRPC,
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
    throw new FabricPreconditionError(
      stages.length === 0
        ? 'No stages deployed for this project yet — run `pikku fabric deploy apply <branch>` first.'
        : `--branch is required — this project has ${stages.length} stages: ${known.join(', ')}`
    )
  }

  const stage = stages.find((s) => s.branch === branch)
  if (!stage) {
    throw new FabricPreconditionError(
      `No stage for branch "${branch}".${known.length ? ` Existing: ${known.join(', ')}` : ''}`
    )
  }
  return { stageId: stage.stageId, branch: stage.branch }
}

export async function resolveStageId(
  rpc: ChangesRPC,
  projectId: string,
  branch: string | undefined
): Promise<string> {
  return (await resolveStage(rpc, projectId, branch)).stageId
}

const hostOf = (value: string): string => {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).host
  } catch {
    return value
  }
}

/**
 * Find the stage a person named however they happened to name it: the branch
 * (`develop`), the address they were looking at when they filed
 * (`https://fabric-develop-….pikkufabric.dev`, with or without the scheme or a
 * path), or its id.
 */
export async function matchStage(
  rpc: ChangesRPC,
  projectId: string,
  ref: string
): Promise<ResolvedStage> {
  const { stages } = await rpc.invoke('listStages', { projectId })
  const wanted = ref.trim()
  const host = hostOf(wanted).toLowerCase()
  const stage = stages.find(
    (s) =>
      s.stageId === wanted ||
      s.branch === wanted ||
      [s.url, s.containerUrl].some(
        (url) => !!url && hostOf(url).toLowerCase() === host
      )
  )
  if (!stage) {
    const known = stages.map((s) =>
      s.url ? `${s.branch} (${s.url})` : s.branch
    )
    throw new FabricPreconditionError(
      `No stage matches "${wanted}".${known.length ? ` Stages: ${known.join(', ')}` : ' This project has no stages yet.'}`
    )
  }
  return { stageId: stage.stageId, branch: stage.branch }
}

export async function autoDeployOffHints(
  rpc: ChangesRPC,
  projectId: string,
  branch?: string
): Promise<string[]> {
  const { stages } = await rpc.invoke('getProjectDeployments', { projectId })
  return stages
    .filter(
      (s) =>
        (!branch || s.branch === branch) &&
        !s.autoDeployOnPush &&
        s.deployments.some(
          (d) =>
            d.status === 'suspended' && d.statusReason === 'awaiting_approval'
        )
    )
    .map(
      (s) =>
        `waiting for approval — auto-deploy is off (pikku fabric deploy auto on -b ${s.branch})`
    )
}
