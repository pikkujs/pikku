import type { VariablesService } from '@pikku/core/services'
import type {
  ActorSecretResolver,
  HttpPersonasConfig,
} from '@pikku/core/persona'

/** A Fabric operator token, which is what a deployed stage accepts. */
export const OPERATOR_TOKEN_VARIABLE = 'FABRIC_OPERATOR_TOKEN'
/**
 * The ROOT actor secret, which derives every persona's credential and so is
 * entitled to all of them. Only `pikku dev` serves the endpoint it opens.
 */
export const ACTOR_SECRET_VARIABLE = 'SCENARIO_ACTOR_SECRET'
/**
 * Already-derived per-persona credentials, `id=secret` comma-separated — what a
 * run is given when it should be able to sign in as some personas and not the
 * rest. Each value is bound to that persona's address by the target, so the
 * list is the whole of what this run can be.
 */
export const PERSONA_SECRETS_VARIABLE = 'PIKKU_PERSONA_SECRETS'

export type PersonaCredentials = Pick<HttpPersonasConfig, 'secret' | 'operator'>

/**
 * `id=secret,id=secret` into a lookup. A value containing `=` is kept whole —
 * base64url never produces one, but a hand-written credential might.
 */
export const parsePersonaSecrets = (raw: string): Record<string, string> => {
  const secrets: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      throw new Error(
        `${PERSONA_SECRETS_VARIABLE} entry '${trimmed}' is not 'personaId=secret'`
      )
    }
    secrets[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  if (Object.keys(secrets).length === 0) {
    throw new Error(`${PERSONA_SECRETS_VARIABLE} is set but lists no personas`)
  }
  return secrets
}

/**
 * Refuses rather than falling through to the root: a run handed a narrow set of
 * credentials asking for a persona outside it is a run doing something nobody
 * authorised, and the useful answer names the persona.
 */
export const personaSecretResolver = (
  secrets: Record<string, string>
): ActorSecretResolver => {
  return (persona) => {
    const secret = secrets[persona.id]
    if (!secret) {
      throw new Error(
        `No credential for persona '${persona.id}' — ${PERSONA_SECRETS_VARIABLE} carries ` +
          `${Object.keys(secrets).sort().join(', ')}. Mint one with \`pikku persona secret ${persona.id}\`.`
      )
    }
    return secret
  }
}

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
    return { operator: { token } }
  }

  const personaSecrets = await variables.get(PERSONA_SECRETS_VARIABLE)
  if (personaSecrets) {
    return {
      secret: personaSecretResolver(
        parsePersonaSecrets(String(personaSecrets))
      ),
    }
  }

  const secret = await variables.get(ACTOR_SECRET_VARIABLE)
  if (secret) {
    return { secret }
  }

  throw new Error(
    `Neither ${OPERATOR_TOKEN_VARIABLE} nor ${ACTOR_SECRET_VARIABLE} is set — ${what} cannot sign in. ` +
      `Export ${ACTOR_SECRET_VARIABLE} against a local \`pikku dev\` target, or ` +
      `${OPERATOR_TOKEN_VARIABLE} against a deployed one (never put either in pikku.config.json). ` +
      `To hand this run only some personas, mint their credentials with \`pikku persona secret\` and set ${PERSONA_SECRETS_VARIABLE}.`
  )
}
