import { extname } from 'node:path'
import { resolveApiContext } from './config.js'
import { getFabricRPC } from './http.js'
import { FabricPreconditionError } from './errors.js'
import type { CreateChangeInput, GetChangeInput } from '../sdk/rpc-map.gen.d.js'
import { currentBranch } from '../../utils/git.js'
import { readConfigProjectId } from './project-id.js'
import { LOCAL_PROJECT_ID, type ChangesRPC } from './changes-local.js'
import { changesContext, registerChangesBackend } from '../../changes/context.js'

export type { ChangesRPC }
export { changesContext }

/**
 * Fabric keeps the changes of a project that is linked to it:
 *
 *   - Linked (`FABRIC_PROJECT_ID`, or `fabric.projectId` in pikku.config.json,
 *     or an explicit --project-id): the Fabric API only. There is no local
 *     copy, so a re-clone or a sleeping sandbox cannot lose the list.
 *   - Not linked: this backend steps aside and the local file is used.
 *
 * A linked project that cannot reach Fabric fails; it never falls back to the
 * local file. (An offline queue that syncs later is postponed.)
 */
async function fabricBackend({
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
    throw new FabricPreconditionError(
      `This project is backed by Fabric (${projectId}), so its changes live there and you need to be signed in. Run \`pikku fabric login\`, or set FABRIC_TOKEN.`
    )
  const fabric = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
  const invoke = async (name: string, data: unknown) => {
    try {
      if (name === 'createChange')
        return await fileChange(fabric, projectId, data as any)
      return await fabric.invoke(name as any, data as any)
    } catch (error) {
      if (httpStatus(error) !== undefined) throw error
      throw new FabricPreconditionError(
        `This project is backed by Fabric, so its changes need a connection and ${ctx.apiUrl} did not answer (${(error as Error).message}). Nothing was changed.`
      )
    }
  }
  return { rpc: { invoke: invoke as ChangesRPC['invoke'] }, projectId }
}

registerChangesBackend(fabricBackend)

/**
 * `createSandboxChange` is newer than the generated Fabric client, so the
 * client's call map does not list it yet. This is its shape in Fabric:
 * title, optional body and route in, the filed change out. Drop this when
 * the client is regenerated.
 */
type SandboxFiling = {
  invoke(
    name: 'createSandboxChange',
    data: { title: string; body?: string; route?: string }
  ): Promise<{ change: { changeId: string; shortId: string; title: string } }>
}

/**
 * Filing a change needs a stage, which a person at a terminal did not name:
 * the one on the checked-out branch, else the project's only stage. A sandbox
 * may not list stages, so it files through `createSandboxChange`, which
 * places the change on its own branch.
 */
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
    return (fabric as SandboxFiling).invoke('createSandboxChange', { title, body, route })
  }
  const branch = await currentBranch().catch(() => undefined)
  const stage =
    stages.find((s) => s.branch === branch) ??
    (stages.length === 1 ? stages[0] : undefined)
  if (!stage)
    throw new FabricPreconditionError(
      `No stage for ${branch ?? 'this checkout'} among ${stages.length} stages. Pass --stage-id.`
    )
  return fabric.invoke('createChange', { ...data, stageId: stage.stageId })
}

/** The Fabric project this checkout is marked as backed by, or null when it is a purely local one. */
async function linkedProjectId(override?: string): Promise<string | null> {
  const explicit = override?.trim() || process.env.FABRIC_PROJECT_ID?.trim()
  if (explicit) return explicit
  return (await readConfigProjectId())?.projectId ?? null
}

export function requireProjectId(projectId: string | null): string {
  if (!projectId)
    throw new FabricPreconditionError(
      'No fabric project. Pass --project-id, or run `pikku fabric link` in the checkout.'
    )
  return projectId
}

/**
 * Text a person will read on the thread, trimmed, or refused when there is
 * none. The CLI enforces no input schema at runtime, so a `.trim().min(1)`
 * there would let "   " through.
 */
export function nonBlank(text: string, refusal: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new FabricPreconditionError(refusal)
  return trimmed
}

/**
 * Split a repeatable comma-separated option into ids. `--change-ids a,b
 * --change-ids c` and `--change-ids a --change-ids b` both mean the same list,
 * because a harness building the flag from a shell loop will produce either.
 */
export function idList(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  const ids = values
    .flatMap((value) => value.split(','))
    .map((id) => id.trim())
    .filter(Boolean)
  return ids.length ? ids : undefined
}

/** The HTTP status a failed `rpc.invoke` carried, if it got as far as a response. */
export const httpStatus = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : undefined
}

const SHORT_ID = /^#?(\d+)$/

/**
 * Name a change the way a person refers to it — `2`, `#2` — as well as by
 * uuid. fabric looks a number up inside the project, so a short id carries the
 * linked project; a uuid goes alone, so it still works from any directory.
 */
export function changeRef(
  projectId: string | null,
  ref: string
): Pick<GetChangeInput, 'changeId' | 'projectId'> {
  const changeId = ref.trim()
  const match = changeId.match(SHORT_ID)
  if (!match) return { changeId }
  if (!projectId)
    throw new FabricPreconditionError(
      `#${match[1]} is a short id, which only means something inside a project. Pass the uuid, or run this from the linked checkout.`
    )
  return { changeId, projectId }
}

const span = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`
  return `${Math.round(minutes / (60 * 24))}d`
}

/** How long ago something happened — for timestamps in the past. */
export function age(at: Date | string): string {
  return span(Math.round((Date.now() - new Date(at).getTime()) / 60_000))
}

/**
 * How long is left — for a lease expiry, which is in the future. Passing one of
 * those to `age` renders it as `-30m`, and an expiry already behind us is `0m`
 * rather than a negative number, because the lease is simply over.
 */
export function remaining(at: Date | string): string {
  const minutes = Math.round((new Date(at).getTime() - Date.now()) / 60_000)
  return span(Math.max(0, minutes))
}

/** A wall-clock time, `14:05`, for when something held becomes claimable. */
export function clockTime(at: Date | string): string {
  const date = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
} as const

export type ImageContentType =
  (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES]

/** The content type an image path implies, or undefined if the name says nothing. */
export function imageContentType(path: string): ImageContentType | undefined {
  const extension = extname(path).toLowerCase()
  return CONTENT_TYPES[extension as keyof typeof CONTENT_TYPES]
}
