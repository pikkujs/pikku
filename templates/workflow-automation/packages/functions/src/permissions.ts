import { pikkuPermission } from '#pikku/auth'

// @snippet start permissionFunction
/**
 * Owns the flow this run belongs to.
 *
 * "Yours" depends on the row, so it cannot be a scope. It pairs with
 * `runs:cancel` rather than replacing it: an operator holds the scope and owns
 * nothing, a builder owns flows and holds no cancel scope, and the two gates
 * let each do exactly their half without a branch in the function.
 *
 * Fails closed on a missing session or a missing row — throwing would leak the
 * difference between "not yours" and "does not exist", which is how id
 * enumeration finds real flows.
 */
export const isFlowOwner = pikkuPermission(
  async ({ kysely }, { runId }: { runId: string }, { session }) => {
    if (!session) return false
    const row = await kysely
      .selectFrom('flowRun')
      .innerJoin('flow', 'flow.flowId', 'flowRun.flowId')
      .select('flow.ownerUserId')
      .where('flowRun.runId', '=', runId)
      .executeTakeFirst()
    return row?.ownerUserId === session.userId
  }
)
// @snippet end permissionFunction
