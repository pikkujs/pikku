/**
 * Secrets this project reads that no scaffold declares for it.
 *
 * `auth.ts` reads `SCENARIO_VIRTUAL_USER_SECRET`, so pikku requires a declaration for it
 * (PKU951) — without one, codegen fails and the dev server will not boot.
 *
 * It is `optional` because absence is a supported state: unset simply disables
 * `/api/auth/sign-in/virtual-user` and the virtual user plugin refuses every sign-in. A deploy
 * that does not set it is a deploy with scenario sign-in off, not a broken one, so
 * the deploy gate must not demand a value.
 */
import { defineSecret } from '@pikku/core/secret'
import { z } from 'zod'

export const ScenarioVirtualUserSecretSchema = z.string()

defineSecret({
  name: 'scenarioVirtualUserSecret',
  displayName: 'Scenario Virtual user Secret',
  description:
    'Signing key for /api/auth/sign-in/virtual-user. Unset disables virtual user sign-in.',
  secretId: 'SCENARIO_VIRTUAL_USER_SECRET',
  schema: ScenarioVirtualUserSecretSchema,
  optional: true,
})
