import { extname } from 'node:path'
import { resolveApiContext } from './config.js'
import { getFabricRPC } from './http.js'
import { FabricPreconditionError } from './errors.js'
import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

/**
 * Resolve the three things every `changes` command needs: the api url, a
 * bearer, and the project the queue belongs to.
 *
 * `requireProject` is false for the per-item commands, which address a change
 * by id and so work from any directory — a harness reading a queue is often
 * not sitting in the checkout it is about to edit.
 */
export async function changesContext(
  apiUrlOverride: string | undefined,
  projectIdOverride?: string
): Promise<{ rpc: PikkuRPC; projectId: string | null }> {
  const ctx = await resolveApiContext({ apiUrlOverride })
  if (!ctx.token)
    throw new FabricPreconditionError(
      'Not logged in. Run `pikku fabric login` first.'
    )
  return {
    rpc: getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token }),
    projectId: projectIdOverride ?? ctx.projectId,
  }
}

export function requireProjectId(projectId: string | null): string {
  if (!projectId)
    throw new FabricPreconditionError(
      'No fabric project. Pass --project-id, or run `pikku fabric link` in the checkout.'
    )
  return projectId
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
