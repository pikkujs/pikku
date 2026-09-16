import type { Kysely } from 'kysely'
import type { DB } from '#pikku/db/schema.gen.js'
import { WrongCompanyError } from '../errors.js'

/**
 * Which company the signed-in person works for.
 *
 * Every read and every write in this example starts here, because the tenant
 * is never an input: a `companyId` the caller supplies is a `companyId` the
 * caller can change. It comes off the membership row reached from their own
 * account and nowhere else.
 */
export const currentCompanyId = async (
  kysely: Kysely<DB>,
  userId: string
): Promise<string> => {
  const row = await kysely
    .selectFrom('membership')
    .innerJoin('user', 'user.email', 'membership.email')
    .select('membership.companyId')
    .where('user.id', '=', userId)
    .executeTakeFirst()

  if (!row) throw new WrongCompanyError()
  return row.companyId
}

/**
 * Refuse with 404, not 403.
 *
 * `WrongCompanyError` is a 404 on purpose. A 403 tells the caller the row
 * exists and belongs to somebody else, which is the one fact a tenant boundary
 * is there to withhold — it turns "can I read Northwind's jobs" into "can I
 * enumerate Northwind's job ids", and the answer to the second should be no.
 */
export const assertSameCompany = (
  rowCompanyId: string | null | undefined,
  companyId: string
): void => {
  if (rowCompanyId !== companyId) throw new WrongCompanyError()
}
