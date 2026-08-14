import type { SingletonServices } from './application-types.js'
import { ADMIN_USER, GUEST_USER, STAFF_USER } from './auth-fixtures.js'
import { SCOPES } from '#pikku/scopes/pikku-scopes.gen.js'
import { SYSTEM_ROLES } from '#pikku/scopes/pikku-roles.gen.js'
import { personaList } from '#pikku/workflow/pikku-personas.gen.js'

/** Role granting the console's own scope-admin capabilities. */
export const CONSOLE_ADMIN_ROLE = 'console-admin'
/** Role granting read access to reports, used by the scope-gate suite. */
export const REPORT_VIEWER_ROLE = 'report-viewer'
/** Role granting the umbrella `admin` scope and everything beneath it. */
export const PLATFORM_ADMIN_ROLE = 'platform-admin'
/** Role granting `pikku:console:audit:read`, used by the audit console suite. */
export const AUDIT_READER_ROLE = 'audit-reader'

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
 * and role sets, then grants them.
 *
 * Both syncs are additive. Neither composes a role here any more — the three
 * the suites rely on are declared with `defineSystemRole` in
 * `packages/functions/src/roles.ts`, and `syncSystemRoles` writes exactly what
 * the code says. A `createRole` naming one of them would now be refused, which
 * is the point: a system role is part of the application's surface, and the
 * console may grant it but not redefine it.
 *
 * - `admin@e2e.test` gets `console-admin`, so the console Scopes UI RPCs return
 *   200. It deliberately does NOT get `reports:read`.
 * - `guest@e2e.test` gets `report-viewer` so the scope-gate suite can show a 200
 *   for a scoped caller against the admin's 403.
 * - `admin@e2e.test` also gets `audit-reader`, the only grant of
 *   `pikku:console:audit:read`. That leaves `staff@e2e.test` — an admin holding
 *   no audit scope — as the audit console suite's refused case.
 * - `admin@e2e.test` and `staff@e2e.test` get `platform-admin`, which is the
 *   umbrella `admin` scope plus every console area except scope administration and
 *   the audit trail. That is what lets them reach the console at all, what lets
 *   them impersonate (`admin:impersonate`) and what lets them read the user
 *   directory (`admin:users:list`). It is deliberately a *separate* role from `console-admin`
 *   so that staff stays what the scopes-console-permissions suite needs it to
 *   be: an admin holding no scope role, and therefore refused by the
 *   self-hosting scope RPCs. `guest@e2e.test` gets none of it.
 * - The personas carry their own `roles`, and this applies whatever they
 *   declare. Pikku never applies them itself: which scope store exists is the
 *   app's business, which is why the loop runs after the sync above. Their user
 *   rows are created by `seedScenarioActors`, which must therefore run before
 *   this.
 * - Those declarations mirror the fixture users of the same name, so a scenario
 *   expresses "an admin without a scope role", "a caller holding reports:read"
 *   and "a caller holding nothing" through the persona registry rather than by
 *   signing in with a fixture password. The `admin` persona mirrors
 *   `admin@e2e.test` exactly — `platform-admin` to reach the console, plus `console-admin` to drive the scope-admin RPCs and
 *   `audit-reader` to read the trail, neither of which the `admin` root
 *   reaches. `target` declares nothing.
 *
 * Runs after Better Auth has created the `user` table (lifecycle.afterStart).
 */
export const seedScopes = async (services: SingletonServices) => {
  const { scopeService } = services
  await scopeService.init()
  await scopeService.syncScopes(SCOPES)
  await scopeService.syncSystemRoles(SYSTEM_ROLES)

  const adminId = await userIdByEmail(services, ADMIN_USER.email)
  const guestId = await userIdByEmail(services, GUEST_USER.email)
  const staffId = await userIdByEmail(services, STAFF_USER.email)
  await scopeService.addUserToRole(adminId, CONSOLE_ADMIN_ROLE)
  await scopeService.addUserToRole(guestId, REPORT_VIEWER_ROLE)
  await scopeService.addUserToRole(adminId, PLATFORM_ADMIN_ROLE)
  await scopeService.addUserToRole(adminId, AUDIT_READER_ROLE)
  await scopeService.addUserToRole(staffId, PLATFORM_ADMIN_ROLE)

  const granted: string[] = []
  for (const persona of personaList) {
    if (persona.roles.length === 0) {
      continue
    }
    const personaId = await userIdByEmail(services, persona.email)
    for (const role of persona.roles) {
      await scopeService.addUserToRole(personaId, role)
    }
    granted.push(`${persona.email} -> ${persona.roles.join(' + ')}`)
  }

  services.logger.info(
    `seeded scopes: ${ADMIN_USER.email} -> ${CONSOLE_ADMIN_ROLE} + ${PLATFORM_ADMIN_ROLE} + ${AUDIT_READER_ROLE}, ${STAFF_USER.email} -> ${PLATFORM_ADMIN_ROLE}, ${GUEST_USER.email} -> ${REPORT_VIEWER_ROLE}, ${granted.join(', ')}`
  )
}
