import { MissingSessionError } from '../../errors/errors.js'
import { getSingletonServices } from '../../pikku-state.js'
import type { WorkflowRunWire, WorkflowRuntimeMeta } from './workflow.types.js'

/**
 * A run stores only its owner's user id; every execution loads the session
 * fresh from the session store and judges it. Without a store there is nothing
 * to load, so a run with an owner stops here instead of inventing a session.
 *
 * knowledge: decisions/security/a-run-loads-its-owners-session-every-time-it-executes.md
 */
export const assertRunSessionStore = (
  pikkuUserId: string | undefined
): void => {
  if (pikkuUserId && !getSingletonServices()?.sessionStore) {
    throw new Error(
      'workflows that need a session require a sessionStore (e.g. @pikku/better-auth)'
    )
  }
}

/**
 * A graph has no function to run, so its `auth` is applied here: unset needs a
 * session, loaded from the session store for the run's owner.
 */
export const assertGraphSession = async (
  meta: WorkflowRuntimeMeta,
  wire: WorkflowRunWire
): Promise<void> => {
  if (meta.auth === false) return
  assertRunSessionStore(wire.pikkuUserId)
  const session =
    wire.pikkuUserId &&
    (await getSingletonServices()?.sessionStore?.get(wire.pikkuUserId))
  if (!session) throw new MissingSessionError('Authentication required')
}
