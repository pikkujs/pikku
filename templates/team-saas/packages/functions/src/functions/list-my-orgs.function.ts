import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const ListMyOrgsInput = z.object({})

export const ListMyOrgsOutput = z.object({
  organisations: z.array(
    z.object({
      orgId: z.string(),
      name: z.string(),
      slug: z.string(),
      orgRole: z.string(),
    })
  ),
})

/**
 * The organisations this caller belongs to.
 *
 * Deliberately takes no `orgId` and needs no tenancy permission: the membership
 * table *is* the answer, filtered by the session. This is the one read in a
 * multi-tenant product that legitimately spans tenants, because it is asking
 * "which are mine" rather than "what is in this one".
 */
export const listMyOrgs = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'The organisations the signed-in user belongs to, with their role in each.',
  input: ListMyOrgsInput,
  output: ListMyOrgsOutput,
  func: async ({ kysely }, _input, { session }) => {
    const organisations = await kysely
      .selectFrom('membership')
      .innerJoin('organisation', 'organisation.orgId', 'membership.orgId')
      .select([
        'organisation.orgId',
        'organisation.name',
        'organisation.slug',
        'membership.orgRole',
      ])
      .where('membership.userId', '=', session.userId)
      .orderBy('organisation.name')
      .execute()

    return { organisations }
  },
})
