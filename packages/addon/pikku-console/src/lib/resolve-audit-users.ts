import type { BetterAuthInstance } from '@pikku/better-auth'
import type { CoreSingletonServices } from '@pikku/core'

/** Who a user id belongs to. */
export type AuditUserProfile = {
  name?: string
  email?: string
  /**
   * True for a scenario actor — better-auth's `actor` column, which the actor
   * plugin sets and `CoreUserSession.actor` mirrors. Absent in an app that does
   * not run scenarios, so absence means "an ordinary user", not "unknown".
   */
  actor?: boolean
}

/** Who each user id on a page belongs to, keyed by that id. */
export type AuditUserDirectory = Record<string, AuditUserProfile>

/**
 * Resolves the user ids on a page of the trail to the people behind them.
 *
 * The trail stores an id because that is the only thing stable enough to record
 * — a name can change after the event, and an audit row must not. The join
 * therefore happens at read time, and it happens here rather than in SQL: the
 * sink and the user table are routinely different databases (and on a queue
 * sink, different systems entirely), so there is no query that spans both.
 *
 * Read through better-auth's own adapter as the server, not as the caller.
 * `pikku:console:audit:read` already grants "every recorded action, and which user took
 * it", so a reader who may see the id may see the name — an opaque id would be
 * the same disclosure, just unreadable. Reading the adapter directly also
 * reaches actor rows, which the admin user list deliberately hides: nobody
 * picks a scenario actor out of a people-picker, but a trail that cannot say an
 * actor did it is worse than one that names them.
 *
 * An id missing from the result is not an error: a deleted account leaves its
 * events behind on purpose, and the caller falls back to showing the id.
 */
export const resolveAuditUsers = async (
  auth: (() => Promise<BetterAuthInstance>) | undefined,
  userIds: Array<string | undefined>,
  logger?: CoreSingletonServices['logger']
): Promise<AuditUserDirectory> => {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))]
  if (!auth || ids.length === 0) {
    return {}
  }

  let adapter: { findUserById?: (id: string) => Promise<any> } | undefined
  try {
    adapter = (await (await auth()).$context)?.internalAdapter
  } catch (error) {
    logger?.warn(
      `Audit users could not be resolved, showing ids instead: ${error}`
    )
    return {}
  }
  if (!adapter?.findUserById) {
    return {}
  }

  const directory: AuditUserDirectory = {}
  await Promise.all(
    ids.map(async (id) => {
      try {
        const user = await adapter.findUserById!(id)
        if (user) {
          directory[id] = {
            name: user.name || undefined,
            email: user.email || undefined,
            actor: user.actor === true ? true : undefined,
          }
        }
      } catch (error) {
        // One unreadable row must not cost the whole page its names.
        logger?.debug?.(`Audit user '${id}' could not be resolved: ${error}`)
      }
    })
  )
  return directory
}
