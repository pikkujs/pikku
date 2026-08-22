import type { VariablesService } from '@pikku/core/services'
import type { HttpPersonasConfig } from '@pikku/core/persona'

/** A Fabric operator token, which is what a deployed stage accepts. */
export const OPERATOR_TOKEN_VARIABLE = 'FABRIC_OPERATOR_TOKEN'
/** The actor plugin's passwordless secret, which only `pikku dev` serves. */
export const ACTOR_SECRET_VARIABLE = 'SCENARIO_ACTOR_SECRET'
/** Opt in to creating persona accounts the target does not already have. */
export const CREATE_MISSING_VARIABLE = 'PIKKU_PERSONA_CREATE_MISSING'

export type PersonaCredentials = Pick<HttpPersonasConfig, 'secret' | 'operator'>

/**
 * How the personas in this run will sign in, decided by which credential the
 * environment actually holds.
 *
 * An operator token wins when both are present. It is the stronger of the two —
 * asymmetric, and it never needs an account the target would not otherwise
 * have — so a run that could use either should not fall back to the weaker one.
 *
 * `what` names the thing that cannot proceed ('scenario actors', 'a virtual
 * user'), because the same missing credential blocks several commands and the
 * message should say which one the operator was running.
 */
export const resolvePersonaCredentials = async (
  variables: VariablesService,
  what: string
): Promise<PersonaCredentials> => {
  const token = await variables.get(OPERATOR_TOKEN_VARIABLE)
  if (token) {
    const createMissing =
      (await variables.get(CREATE_MISSING_VARIABLE)) === 'true'
    return { operator: { token, createMissing } }
  }

  const secret = await variables.get(ACTOR_SECRET_VARIABLE)
  if (secret) {
    return { secret }
  }

  throw new Error(
    `Neither ${OPERATOR_TOKEN_VARIABLE} nor ${ACTOR_SECRET_VARIABLE} is set — ${what} cannot sign in. ` +
      `Export ${ACTOR_SECRET_VARIABLE} against a local \`pikku dev\` target, or ` +
      `${OPERATOR_TOKEN_VARIABLE} against a deployed one (never put either in pikku.config.json).`
  )
}
