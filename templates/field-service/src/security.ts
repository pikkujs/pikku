import { hasScopes } from '@pikku/core/scope'
import { pikkuPermission } from '#pikku/auth'
import { currentCompanyId } from './lib/tenant.js'

/**
 * Scopes and permissions answer different questions, and BOTH must pass.
 *
 * `scopes` is what the role entitles you to, AND-ed. `permissions` is what is
 * true of this particular row; its keys OR together, so any one of them
 * admits the caller. The OR is inside `permissions` only — holding the scope
 * does not excuse you from the permission gate, which is why a function that
 * two different kinds of caller reach needs a key for each of them.
 *
 * The tenant check is deliberately NOT expressed here. A permission that
 * returns false produces a 403, and a 403 confirms the row exists — see
 * `lib/tenant.ts`. Tenancy is enforced inside every query instead, and a miss
 * comes back as a 404.
 */
export const isAssignedTechnician = pikkuPermission(
  async ({ kysely }, { jobId }: { jobId: string }, { session }) => {
    if (!session) return false
    const companyId = await currentCompanyId(kysely, session.userId)
    const row = await kysely
      .selectFrom('job')
      .innerJoin('technician', 'technician.technicianId', 'job.technicianId')
      .innerJoin('user', 'user.email', 'technician.email')
      .select('user.id as userId')
      .where('job.jobId', '=', jobId)
      .where('job.companyId', '=', companyId)
      .executeTakeFirst()
    return row?.userId === session.userId
  }
)

/**
 * The other key on that OR.
 *
 * A dispatcher is not the assigned technician and never will be, so without
 * this the permission gate would lock out exactly the person whose job it is
 * to unstick the board. `hasScopes` applies the same parent-grant rules the
 * `scopes` field does, so the dispatcher's `jobs` grant satisfies it.
 */
export const canDispatch = pikkuPermission(
  async (_services, _data, { session }) =>
    hasScopes(['jobs:assign'], session?.scopes)
)
