import {
  PreconditionError,
  httpStatus,
  registerChangesBackend,
  type ChangesRPC,
} from '@pikku/cli/addon-support'
import { resolveApiContext } from './config.js'
import { getFabricRPC } from './http.js'
import { readConfigProjectId } from './project-id.js'

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

registerChangesBackend(fabricChangesBackend)
