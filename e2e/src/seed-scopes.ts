import { ADMIN_SCOPE_ROOT } from '@pikku/better-auth'
import type { SingletonServices } from './application-types.js'
import { ADMIN_USER, GUEST_USER, STAFF_USER } from './auth-fixtures.js'
import { SCOPES } from '#pikku/scopes/pikku-scopes.gen.js'
import { scenarioActorList } from '#pikku/workflow/pikku-scenario-actors.gen.js'

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
 * - `admin@e2e.test` and `staff@e2e.test` are granted the umbrella `admin`
 *   scope directly, outside any role. That is what passes the console's global
 *   admin gate, what lets them impersonate (`admin:impersonate`) and what lets
 *   them read the user directory (`admin:users:list`) — one parent grant covers
 *   all three. It is a direct grant rather than a role so that staff stays what
 *   the scopes-console-permissions suite needs it to be: an admin holding no
 *   scope role, and therefore refused by the self-hosting scope RPCs.
 *   `guest@e2e.test` deliberately gets none of it.
 * - The scenario actors carry their own `scopes`/`roles` in
 *   `pikku.config.json`, and this applies whatever they declare. Pikku never
 *   applies them itself: which scope store exists and which roles have been
 *   created is the app's business, which is why the loop runs after the roles
 *   above are composed. Their user rows are created by `seedScenarioActors`,
 *   which must therefore run before this.
 * - Those declarations mirror the fixture users of the same name, so a scenario
 *   expresses "an admin without a scope role", "a caller holding reports:read"
 *   and "a caller holding nothing" through the actor registry rather than by
 *   signing in with a fixture password. The `admin` actor mirrors
 *   `admin@e2e.test` exactly — the umbrella `admin` scope to pass the console's
 *   global admin gate, plus `console-admin` to drive the scope-admin RPCs,
 *   which the `admin` root does not reach. `target` declares nothing.
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
  const staffId = await userIdByEmail(services, STAFF_USER.email)
  await scopeService.addUserToRole(adminId, CONSOLE_ADMIN_ROLE)
  await scopeService.addUserToRole(guestId, REPORT_VIEWER_ROLE)
  await scopeService.addScopeToUser(adminId, ADMIN_SCOPE_ROOT)
  await scopeService.addScopeToUser(staffId, ADMIN_SCOPE_ROOT)

  const granted: string[] = []
  for (const actor of scenarioActorList) {
    const scopes = actor.scopes ?? []
    const roles = actor.roles ?? []
    if (scopes.length === 0 && roles.length === 0) {
      continue
    }
    const actorId = await userIdByEmail(services, actor.email)
    for (const scope of scopes) {
      await scopeService.addScopeToUser(actorId, scope)
    }
    for (const role of roles) {
      await scopeService.addUserToRole(actorId, role)
    }
    granted.push(`${actor.email} -> ${[...scopes, ...roles].join(' + ')}`)
  }

  services.logger.info(
    `seeded scopes: ${ADMIN_USER.email} -> ${CONSOLE_ADMIN_ROLE} + ${ADMIN_SCOPE_ROOT}, ${STAFF_USER.email} -> ${ADMIN_SCOPE_ROOT}, ${GUEST_USER.email} -> ${REPORT_VIEWER_ROLE}, ${granted.join(', ')}`
  )
}
