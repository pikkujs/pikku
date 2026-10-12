import {
  LOCAL_PROJECT_ID,
  PreconditionError,
  currentBranch,
  httpStatus,
  registerChangesBackend,
  type ChangesRPC,
} from '@pikku/cli/addon-support'
import { resolveApiContext } from './config.js'
import { getFabricRPC } from './http.js'
import { readConfigProjectId } from './project-id.js'
import type { CreateChangeInput } from '../sdk/rpc-map.gen.d.js'

export async function linkedProjectId(
  override?: string
): Promise<string | null> {
  const explicit = override?.trim() || process.env.FABRIC_PROJECT_ID?.trim()
  if (explicit) return explicit
  return (await readConfigProjectId())?.projectId ?? null
}

export async function fabricChangesBackend({
  apiUrl,
  projectId: projectIdOverride,
}: {
  apiUrl: string | undefined
  projectId: string | undefined
}): Promise<{ rpc: ChangesRPC; projectId: string } | null> {
  const projectId = await linkedProjectId(projectIdOverride)
  if (!projectId) return null
  const ctx = await resolveApiContext({
    apiUrlOverride: apiUrl,
    resolveProject: false,
  })
  if (!ctx.token)
    throw new PreconditionError(
      `This project is backed by Fabric (${projectId}), so its changes live there and you need to be signed in. Run \`pikku fabric login\`, or set FABRIC_TOKEN.`
    )
  const fabric = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
  const invoke = async (name: string, data: unknown) => {
    try {
      if (name === 'createChange')
        return await fileChange(fabric, projectId, data as CreateChangeInput)
      return await fabric.invoke(name as any, data as any)
    } catch (error) {
      if (httpStatus(error) !== undefined) throw error
      throw new PreconditionError(
        `This project is backed by Fabric, so its changes need a connection and ${ctx.apiUrl} did not answer (${(error as Error).message}). Nothing was changed.`
      )
    }
  }
  return { rpc: { invoke: invoke as ChangesRPC['invoke'] }, projectId }
}

type SandboxFiling = {
  invoke(
    name: 'createSandboxChange',
    data: { title: string; body?: string; route?: string }
  ): Promise<{ change: { changeId: string; shortId: string; title: string } }>
}

async function fileChange(
  fabric: ReturnType<typeof getFabricRPC>,
  projectId: string,
  data: CreateChangeInput
) {
  if (data.stageId && data.stageId !== LOCAL_PROJECT_ID)
    return fabric.invoke('createChange', data)
  let stages: { stageId: string; branch: string }[]
  try {
    stages = (await fabric.invoke('listStages', { projectId })).stages
  } catch (error) {
    if (httpStatus(error) !== 403) throw error
    const { title, body, route } = data
    return (fabric as unknown as SandboxFiling).invoke('createSandboxChange', {
      title,
      body,
      route,
    })
  }
  const branch = await currentBranch().catch(() => undefined)
  const stage =
    stages.find((s) => s.branch === branch) ??
    (stages.length === 1 ? stages[0] : undefined)
  if (!stage)
    throw new PreconditionError(
      `No stage for ${branch ?? 'this checkout'} among ${stages.length} stages. Pass --stage-id.`
    )
  return fabric.invoke('createChange', { ...data, stageId: stage.stageId })
}

registerChangesBackend(fabricChangesBackend)
