import type { VariablesService } from '@pikku/core/services'
import { getWiredVirtualUserSignIn } from '@pikku/core/virtual-user'
import type {
  VirtualUserSecretResolver,
  HttpVirtualUsersConfig,
} from '@pikku/core/virtual-user'
import { loadUserModule } from '../functions/commands/load-user-project.js'

/** A Fabric operator token, which is what a deployed stage accepts. */
export const OPERATOR_TOKEN_VARIABLE = 'FABRIC_OPERATOR_TOKEN'
/**
 * The ROOT virtual user secret, which derives every virtual user's credential and so is
 * entitled to all of them. Only `pikku dev` serves the endpoint it opens.
 */
export const VIRTUAL_USER_SECRET_VARIABLE = 'SCENARIO_VIRTUAL_USER_SECRET'
/**
 * Already-derived per-virtual-user credentials, `id=secret` comma-separated — what a
 * run is given when it should be able to sign in as some virtual users and not the
 * rest. Each value is bound to that virtual user's address by the target, so the
 * list is the whole of what this run can be.
 */
export const VIRTUAL_USER_SECRETS_VARIABLE = 'PIKKU_VIRTUAL_USER_SECRETS'

export type VirtualUserCredentials = Pick<
  HttpVirtualUsersConfig,
  'secret' | 'operator'
>

/**
 * `id=secret,id=secret` into a lookup. A value containing `=` is kept whole —
 * base64url never produces one, but a hand-written credential might.
 */
export const parseVirtualUserSecrets = (
  raw: string
): Record<string, string> => {
  const secrets: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      throw new Error(
        `${VIRTUAL_USER_SECRETS_VARIABLE} entry '${trimmed}' is not 'virtualUserId=secret'`
      )
    }
    secrets[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  if (Object.keys(secrets).length === 0) {
    throw new Error(
      `${VIRTUAL_USER_SECRETS_VARIABLE} is set but lists no virtual users`
    )
  }
  return secrets
}

/**
 * Refuses rather than falling through to the root: a run handed a narrow set of
 * credentials asking for a virtual user outside it is a run doing something nobody
 * authorised, and the useful answer names the virtual user.
 */
export const virtualUserSecretResolver = (
  secrets: Record<string, string>
): VirtualUserSecretResolver => {
  return (virtualUser) => {
    const secret = secrets[virtualUser.id]
    if (!secret) {
      throw new Error(
        `No credential for virtual user '${virtualUser.id}' — ${VIRTUAL_USER_SECRETS_VARIABLE} carries ` +
          `${Object.keys(secrets).sort().join(', ')}. Mint one with \`pikku virtual-user secret ${virtualUser.id}\`.`
      )
    }
    return secret
  }
}

export const loadWiredVirtualUserSignIn = async (state: {
  virtualUsers?: { signInFiles?: Iterable<string> }
}): Promise<void> => {
  for (const file of state.virtualUsers?.signInFiles ?? []) {
    await loadUserModule(file)
  }
}

/**
 * How the virtual users in this run will sign in, decided by which credential the
 * environment actually holds.
 *
 * An operator token wins when both are present. It is the stronger of the two —
 * asymmetric, and it never needs an account the target would not otherwise
 * have — so a run that could use either should not fall back to the weaker one.
 *
 * `what` names the thing that cannot proceed ('scenario virtual users', 'a virtual
 * user'), because the same missing credential blocks several commands and the
 * message should say which one the operator was running.
 */
export const resolveVirtualUserCredentials = async (
  variables: VariablesService,
  what: string
): Promise<VirtualUserCredentials> => {
  if (getWiredVirtualUserSignIn()) {
    return {}
  }
  const token = await variables.get(OPERATOR_TOKEN_VARIABLE)
  if (token) {
    return { operator: { token } }
  }

  const virtualUserSecrets = await variables.get(VIRTUAL_USER_SECRETS_VARIABLE)
  if (virtualUserSecrets) {
    return {
      secret: virtualUserSecretResolver(
        parseVirtualUserSecrets(String(virtualUserSecrets))
      ),
    }
  }

  const secret = await variables.get(VIRTUAL_USER_SECRET_VARIABLE)
  if (secret) {
    return { secret }
  }

  throw new Error(
    `Neither ${OPERATOR_TOKEN_VARIABLE} nor ${VIRTUAL_USER_SECRET_VARIABLE} is set — ${what} cannot sign in. ` +
      `Export ${VIRTUAL_USER_SECRET_VARIABLE} against a local \`pikku dev\` target, or ` +
      `${OPERATOR_TOKEN_VARIABLE} against a deployed one (never put either in pikku.config.json). ` +
      `To hand this run only some virtual users, mint their credentials with \`pikku virtual-user secret\` and set ${VIRTUAL_USER_SECRETS_VARIABLE}.`
  )
}
