import type { CoreUserSession } from '../../types/core.types.js'
import { hasAnyScope } from '../../scopes.js'
import type {
  FlagConfigSnapshot,
  FlagState,
  FlagSubject,
  ResolvedFlag,
} from './flag.types.js'

/**
 * FNV-1a over `${flag}:${subject}`.
 *
 * Salted by flag key so two flags at 50% do not select the same half and
 * concurrent rollouts stay independent. Sync and non-crypto on purpose:
 * WebCrypto's digest is async and this runs inside resolution, which does no
 * I/O and cannot await.
 */
export const bucketOf = (flag: string, subject: string): number => {
  let h = 0x811c9dc5
  const s = `${flag}:${subject}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 10_000
}

/**
 * The subject a bucket and an override are keyed on.
 *
 * Organization first: a percentage rollout that splits colleagues inside one
 * account is a support ticket, not an experiment.
 */
export const subjectIdOf = (
  subject: FlagSubject | undefined
): string | undefined => {
  const id = subject?.organizationId ?? subject?.userId
  return id === undefined || id === '' ? undefined : id
}

/**
 * Resolves one flag from the session and the config snapshot. Pure, sync, and
 * the only thing on the request path — the I/O is the snapshot read, which the
 * caller has already done and which implementations cache.
 *
 * `subject` is passed explicitly rather than read off the session because the
 * subject is not always in one: a queue worker, a cron task or a workflow step
 * knows its organization from its input, and resolving those against no subject
 * would skip every per-org override and deny an org that was explicitly
 * granted. Where it is omitted the session is used.
 *
 * A flag absent from the snapshot fails OPEN on availability, falling back to
 * the declaration compiled into the bundle. Treating an unreadable config as
 * everything-off turns a transient store blip into a total outage of your own
 * product. It is safe only because `capable` comes from the session and
 * `scopes:` is untouched, so failing open cannot expose anything the caller was
 * not already authorized for.
 */
export const resolveFlag = (
  key: string,
  anyOf: readonly string[] | undefined,
  session: CoreUserSession | undefined,
  config: FlagConfigSnapshot,
  subject?: FlagSubject
): FlagState => {
  const capable =
    anyOf === undefined ? true : hasAnyScope(anyOf, session?.scopes)
  const row = config[key]

  if (!row) {
    return { available: true, capable }
  }

  const id =
    subjectIdOf(subject) ??
    subjectIdOf({ organizationId: session?.orgId, userId: session?.userId })

  const override = id === undefined ? undefined : row.overrides[id]
  if (override !== undefined) {
    return { available: override, capable }
  }

  // No subject skips the bucket rather than failing it. A sessionless caller
  // has nothing to hash, and hashing a constant would put every cron run in one
  // bucket — making a 10% rollout either 0% or 100% of background work at
  // random. A percentage is a statement about users; background work is either
  // on or off.
  const inBucket =
    row.rolloutPercent === null || id === undefined
      ? true
      : bucketOf(key, id) < Math.round(row.rolloutPercent * 100)

  return { available: row.enabled && inBucket, capable }
}

/** {@link resolveFlag} plus the `show` a client renders on. */
export const resolveFlagForClient = (
  key: string,
  anyOf: readonly string[] | undefined,
  session: CoreUserSession | undefined,
  config: FlagConfigSnapshot,
  subject?: FlagSubject
): ResolvedFlag => {
  const state = resolveFlag(key, anyOf, session, config, subject)
  return { ...state, show: state.available && state.capable }
}
