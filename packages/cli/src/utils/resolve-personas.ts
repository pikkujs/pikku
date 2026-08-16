import {
  personaEmails,
  validateAndBuildPersonasMeta,
} from '@pikku/core/persona'
import type {
  PersonaMeta,
  PersonasMeta,
  PersonaDefinitions,
} from '@pikku/core/persona'
import type { ResolvedPersona } from '@pikku/core/services'

/**
 * Where a persona's mail lands when the project has not said.
 *
 * Deliberately a domain nobody can own rather than something plausible: an app
 * that never sends mail runs fine against it, and one that does fails loudly at
 * the first send instead of quietly delivering a magic link to a stranger.
 */
export const DEFAULT_PERSONA_EMAIL_DOMAIN = 'personas.invalid'

/**
 * The personas a run actually sees: every declaration, with its address filled
 * in.
 *
 * Every consumer resolves through here rather than reading the definitions
 * directly, because the address is the part nobody declares and everybody
 * needs — codegen writes it into `personaConfigs`, the seed creates the user
 * rows from it, and both `scenario run` and `persona run` sign in with it.
 * Computing it in three places is how two of them end up disagreeing.
 */
export const resolvePersonas = (
  definitions: PersonaDefinitions,
  domain: string = DEFAULT_PERSONA_EMAIL_DOMAIN,
  runId?: string
): Record<string, ResolvedPersona> => {
  const meta: PersonasMeta = validateAndBuildPersonasMeta(definitions)
  const ids = Object.keys(meta)
  const emails = personaEmails(ids, domain, runId)

  const resolved: Record<string, ResolvedPersona> = {}
  for (const id of ids) {
    resolved[id] = { ...(meta[id] as PersonaMeta), email: emails[id]! }
  }
  return resolved
}

/**
 * Re-exported rather than declared here: the scaffolded `runVirtualUser` RPC
 * needs the same expansion at runtime, so it lives in core beside
 * `prepareVirtualUserRun` and this keeps the CLI's existing import sites.
 */
export { personaScopes } from '@pikku/core/virtual-user'
