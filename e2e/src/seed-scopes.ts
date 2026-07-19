import type { SingletonServices } from './application-types.js'
import { ADMIN_USER, GUEST_USER } from './auth-fixtures.js'
import { SCOPES } from '#pikku/scopes/pikku-scopes.gen.js'

/** Role granting the console's own scope-admin capabilities. */
export const CONSOLE_ADMIN_ROLE = 'console-admin'
/** Role granting read access to reports, used by the scope-gate suite. */
export const REPORT_VIEWER_ROLE = 'report-viewer'

const userIdByEmail = async (
  services: SingletonServices,
  email: string
): Promise<string> => {
  const row = await (services.kysely as any)
    .selectFrom('user')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst()
  if (!row) {
    throw new Error(`seed-scopes: no user for ${email}`)
  }
  return row.id
}

/**
 * Brings the scope store up: creates the tables, registers the declared scope
 * set, then composes the two roles the e2e suites rely on and grants them.
 *
 * - `admin@e2e.test` gets `pikku:scopes:manage`/`read` so the console Scopes UI
 *   RPCs return 200. It deliberately does NOT get `reports:read`.
 * - `guest@e2e.test` gets `reports:read` so the scope-gate suite can show a 200
 *   for a scoped caller against the admin's 403.
 *
 * Runs after Better Auth has created the `user` table (lifecycle.afterStart).
 */
export const seedScopes = async (services: SingletonServices) => {
  const { scopeService } = services
  await scopeService.init()
  await scopeService.syncScopes(SCOPES)

  await scopeService.createRole({
    name: CONSOLE_ADMIN_ROLE,
    description: 'Manage roles and scopes in the console',
    scopes: ['pikku:scopes:read', 'pikku:scopes:manage'],
  })
  await scopeService.createRole({
    name: REPORT_VIEWER_ROLE,
    description: 'Read reports',
    scopes: ['reports:read'],
  })

  const adminId = await userIdByEmail(services, ADMIN_USER.email)
  const guestId = await userIdByEmail(services, GUEST_USER.email)
  await scopeService.addUserToRole(adminId, CONSOLE_ADMIN_ROLE)
  await scopeService.addUserToRole(guestId, REPORT_VIEWER_ROLE)

  services.logger.info(
    `seeded scopes: ${ADMIN_USER.email} -> ${CONSOLE_ADMIN_ROLE}, ${GUEST_USER.email} -> ${REPORT_VIEWER_ROLE}`
  )
}
