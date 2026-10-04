import { extname } from 'node:path'
import { resolveApiContext } from './config.js'
import { getFabricRPC } from './http.js'
import { FabricPreconditionError } from './errors.js'
import type { GetChangeInput } from '../sdk/rpc-map.gen.d.js'
import { currentBranch } from '../../utils/git.js'
import {
  LOCAL_PROJECT_ID,
  fabricLinks,
  linkFabric,
  localChangesRPC,
  localStorePath,
  type ChangesRPC,
} from './changes-local.js'

export type { ChangesRPC }

type Fabric = { rpc: ChangesRPC; projectId: string }

const REGISTERED = new Set([
  'createChange',
  'claimChanges',
  'completeChange',
  'askChangeQuestion',
  'replyToChange',
  'attachChangeShot',
])

export async function changesContext(
  apiUrlOverride: string | undefined,
  projectIdOverride?: string
): Promise<{ rpc: ChangesRPC; projectId: string; storePath: string }> {
  const storePath = await localStorePath()
  const local = localChangesRPC(storePath)
  let fabric: Promise<Fabric | null> | undefined
  const invoke = async (name: string, data: any) => {
    const result = await local.invoke(name as any, data)
    if (REGISTERED.has(name)) {
      fabric ??= fabricTarget(apiUrlOverride, projectIdOverride)
      const target = await fabric
      if (target)
        await register(storePath, target, name, data, result).catch(
          (error: Error) =>
            console.error(`Not registered with fabric: ${error.message}`)
        )
    }
    return result
  }
  return {
    rpc: { invoke: invoke as ChangesRPC['invoke'] },
    projectId: LOCAL_PROJECT_ID,
    storePath,
  }
}

async function fabricTarget(
  apiUrlOverride: string | undefined,
  projectIdOverride: string | undefined
): Promise<Fabric | null> {
  try {
    const ctx = await resolveApiContext({
      apiUrlOverride,
      resolveProject: !projectIdOverride,
    })
    if (!ctx.token) return null
    const projectId = projectIdOverride ?? ctx.projectId
    if (!projectId) {
      console.error(
        'Not registered with fabric: this checkout is not linked to a project (pikku fabric link).'
      )
      return null
    }
    return {
      rpc: getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token }),
      projectId,
    }
  } catch (error) {
    console.error(`Not registered with fabric: ${(error as Error).message}`)
    return null
  }
}

async function fabricStage(fabric: Fabric): Promise<string> {
  const { stages } = await fabric.rpc.invoke('listStages', {
    projectId: fabric.projectId,
  })
  const branch = await currentBranch().catch(() => undefined)
  const stage =
    stages.find((s) => s.branch === branch) ??
    (stages.length === 1 ? stages[0] : undefined)
  if (!stage)
    throw new FabricPreconditionError(
      `no stage for ${branch ?? 'this checkout'} among ${stages.length} stages`
    )
  return stage.stageId
}

async function register(
  storePath: string,
  fabric: Fabric,
  name: string,
  data: any,
  result: any
): Promise<void> {
  const links = await fabricLinks(storePath)
  if (name === 'createChange') {
    const stageId =
      data.stageId && data.stageId !== LOCAL_PROJECT_ID
        ? data.stageId
        : await fabricStage(fabric)
    const { change } = await fabric.rpc.invoke('createChange', {
      ...data,
      stageId,
    })
    await linkFabric(
      storePath,
      'changes',
      result.change.changeId,
      change.changeId
    )
    return
  }
  if (name === 'claimChanges') {
    const changeIds = result.changes
      .map((c: { changeId: string }) => links.changes[c.changeId])
      .filter(Boolean)
    if (!changeIds.length) return
    const { group } = await fabric.rpc.invoke('claimChanges', {
      projectId: fabric.projectId,
      groupId: links.groups[result.group.groupId],
      changeIds,
      title: result.group.title,
      claimedBy: data.claimedBy,
      leaseMinutes: data.leaseMinutes,
    })
    await linkFabric(storePath, 'groups', result.group.groupId, group.groupId)
    return
  }
  const localId = result.change?.changeId ?? result.message?.changeId
  const changeId = links.changes[localId]
  if (!changeId) return
  await fabric.rpc.invoke(name as any, {
    ...data,
    changeId,
    projectId: undefined,
  })
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
