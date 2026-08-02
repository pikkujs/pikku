import {
  PRODUCTION_DISPOSITION,
  type VirtualUserDisposition,
} from '../virtual-user/virtual-user.types.js'

/**
 * Which environments a persona may run against, and the one rule on it.
 *
 * Two callers, deliberately sharing this file. The inspector checks the
 * declaration at build time; sign-in re-checks against the environment actually
 * resolved at run time. Neither is redundant — the build check trusts the file,
 * and the run check does not trust which artifact got deployed.
 */

/** The part of an environment entry this rule cares about. */
export interface PersonaEnvironment {
  production?: boolean
}

/** What a persona needs to expose for the rule to be applied to it. */
export interface PersonaEnvironmentSubject {
  disposition?: VirtualUserDisposition
  environments?: string[]
}

/**
 * The environments a persona may target, resolved.
 *
 * An omitted `environments` means every configured environment **except** the
 * production ones: production is opt-in for everybody, so nothing reaches it by
 * being forgotten.
 */
export const resolvePersonaEnvironments = (
  persona: PersonaEnvironmentSubject,
  environments: Readonly<Record<string, PersonaEnvironment>>
): string[] => {
  if (persona.environments) {
    return [...persona.environments]
  }
  return Object.entries(environments)
    .filter(([, env]) => !env.production)
    .map(([name]) => name)
}

/**
 * The declaration check, as a list of messages. Empty means the persona's
 * `environments` are coherent with the config and its disposition.
 *
 * An unknown environment name is an error rather than a shrug: a typo silently
 * narrowing a persona to nothing is the same class of bug as the one this whole
 * rule exists to prevent, only quieter.
 */
export const personaEnvironmentErrors = (
  id: string,
  persona: PersonaEnvironmentSubject,
  environments: Readonly<Record<string, PersonaEnvironment>>
): string[] => {
  if (!persona.environments) {
    return []
  }

  const errors: string[] = []
  const known = Object.keys(environments)

  for (const name of persona.environments) {
    const env = environments[name]
    if (!env) {
      errors.push(
        `Persona '${id}' names environment '${name}', which is not configured. ` +
          (known.length
            ? `Configured environments: ${known.join(', ')}.`
            : `Declare it under 'environments' in pikku.config.json.`)
      )
      continue
    }
    if (env.production && persona.disposition !== PRODUCTION_DISPOSITION) {
      errors.push(
        `Persona '${id}' names production environment '${name}' with disposition ` +
          `'${persona.disposition ?? 'realistic'}'. ` +
          `Only '${PRODUCTION_DISPOSITION}' may run against production — every other ` +
          `disposition exists to find out what the product does wrong, which is not a ` +
          `thing to do to real data. Either give '${id}' disposition '${PRODUCTION_DISPOSITION}', ` +
          `or drop '${name}' from its environments.`
      )
    }
  }

  return errors
}

/**
 * The sign-in check: the message to refuse with, or `null` to let the run
 * start.
 *
 * Fails closed on an environment it cannot find. An unresolved `PIKKU_ENV` is
 * the case where the build check has already been passed by a *different*
 * artifact than the one running, so treating "I don't know where I am" as
 * permission is exactly backwards.
 */
export const personaEnvironmentRefusal = (
  id: string,
  persona: PersonaEnvironmentSubject,
  environmentName: string | undefined,
  environments: Readonly<Record<string, PersonaEnvironment>>
): string | null => {
  if (!environmentName) {
    return (
      `Refusing to sign in persona '${id}': no environment is resolved. ` +
      `Set PIKKU_ENV to one of the configured environments (${Object.keys(environments).join(', ') || 'none are configured'}).`
    )
  }

  const env = environments[environmentName]
  if (!env) {
    return (
      `Refusing to sign in persona '${id}': environment '${environmentName}' is not configured. ` +
      `Configured environments: ${Object.keys(environments).join(', ') || 'none'}.`
    )
  }

  if (env.production && persona.disposition !== PRODUCTION_DISPOSITION) {
    return (
      `Refusing to sign in persona '${id}' against production environment '${environmentName}': ` +
      `its disposition is '${persona.disposition ?? 'realistic'}', and only ` +
      `'${PRODUCTION_DISPOSITION}' may act on real data.`
    )
  }

  const allowed = resolvePersonaEnvironments(persona, environments)
  if (!allowed.includes(environmentName)) {
    return (
      `Refusing to sign in persona '${id}' against '${environmentName}': ` +
      `it declares environments ${allowed.join(', ') || 'none'}.`
    )
  }

  return null
}
