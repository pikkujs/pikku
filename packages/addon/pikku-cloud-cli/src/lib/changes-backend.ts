import { CloudPreconditionError, currentBranch } from '@pikku/cli/addon-support'
import {
  LOCAL_PROJECT_ID,
  httpStatus,
  registerChangesBackend,
  type ChangesRPC,
} from '@pikku/addon-changes-cli/backend'
import { resolveApiContext } from './config.js'
import { getCloudRPC } from './http.js'
import { readConfigProjectId } from './project-id.js'
import type { CreateChangeInput } from '../sdk/rpc-map.gen.d.js'

export async function linkedProjectId(
  override?: string
): Promise<string | null> {
  const explicit =
    override?.trim() || process.env.PIKKUSTUDIO_PROJECT_ID?.trim()
  if (explicit) return explicit
  return (await readConfigProjectId())?.projectId ?? null
}

export async function cloudChangesBackend({
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
    throw new CloudPreconditionError(
      `This project is backed by Pikku Studio Cloud (${projectId}), so its changes live there and you need to be signed in. Run \`pikku cloud login\`, or set PIKKUSTUDIO_API_KEY.`
    )
  const cloud = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
  const invoke = async (name: string, data: unknown) => {
    try {
      if (name === 'createChange')
        return await fileChange(cloud, projectId, data as CreateChangeInput)
      return await cloud.invoke(name as any, data as any)
    } catch (error) {
      if (httpStatus(error) !== undefined) throw error
      throw new CloudPreconditionError(
        `This project is backed by Pikku Studio Cloud, so its changes need a connection and ${ctx.apiUrl} did not answer (${(error as Error).message}). Nothing was changed.`
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
  cloud: ReturnType<typeof getCloudRPC>,
  projectId: string,
  data: CreateChangeInput
) {
  if (data.stageId && data.stageId !== LOCAL_PROJECT_ID)
    return cloud.invoke('createChange', data)
  let stages: { stageId: string; branch: string }[]
  try {
    stages = (await cloud.invoke('listStages', { projectId })).stages
  } catch (error) {
    if (httpStatus(error) !== 403) throw error
    const { title, body, route } = data
    return (cloud as unknown as SandboxFiling).invoke('createSandboxChange', {
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
    throw new CloudPreconditionError(
      `No stage for ${branch ?? 'this checkout'} among ${stages.length} stages. Pass --stage-id.`
    )
  return cloud.invoke('createChange', { ...data, stageId: stage.stageId })
}

registerChangesBackend(cloudChangesBackend)
