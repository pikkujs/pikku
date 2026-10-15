import { extname } from 'node:path'
import { httpStatus } from './http-status.js'

export { httpStatus }
import { PreconditionError } from '@pikku/cli/addon-support'
import type { GetChangeInput } from './types.js'
import type { ChangesRPC } from './changes-local.js'
import { changesContext } from './context.js'

export type { ChangesRPC }
export { changesContext }

export function requireProjectId(projectId: string | null): string {
  if (!projectId)
    throw new PreconditionError(
      'No project is linked to this checkout. Pass --project-id, or link the checkout first.'
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
  if (!trimmed) throw new PreconditionError(refusal)
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

const SHORT_ID = /^#?(\d+)$/

/**
 * Name a change the way a person refers to it — `2`, `#2` — as well as by
 * uuid. the backend looks a number up inside the project, so a short id carries the
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
    throw new PreconditionError(
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
