/**
 * Secrets this project reads that no scaffold declares for it.
 *
 * `auth.ts` reads `SCENARIO_ACTOR_SECRET`, so pikku requires a declaration for it
 * (PKU951) — without one, codegen fails and the dev server will not boot.
 *
 * It is `optional` because absence is a supported state: unset simply disables
 * `/api/auth/sign-in/actor` and the actor plugin refuses every sign-in. A deploy
 * that does not set it is a deploy with scenario sign-in off, not a broken one, so
 * the deploy gate must not demand a value.
 */
import { defineSecret } from '@pikku/core/secret'
import { z } from 'zod'

export const ScenarioActorSecretSchema = z.string()

defineSecret({
  name: 'scenarioActorSecret',
  displayName: 'Scenario Actor Secret',
  description: 'Signing key for /api/auth/sign-in/actor. Unset disables actor sign-in.',
  secretId: 'SCENARIO_ACTOR_SECRET',
  schema: ScenarioActorSecretSchema,
  optional: true,
})
