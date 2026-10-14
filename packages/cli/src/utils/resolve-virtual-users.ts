import {
  virtualUserEmails,
  validateAndBuildVirtualUsersMeta,
} from '@pikku/core/virtual-user'
import type {
  VirtualUserMeta,
  VirtualUsersMeta,
  VirtualUserDefinitions,
} from '@pikku/core/virtual-user'
import type { ResolvedVirtualUser } from '@pikku/core/services'

/**
 * Where a virtual user's mail lands when the project has not said.
 *
 * Deliberately a domain nobody can own rather than something plausible: an app
 * that never sends mail runs fine against it, and one that does fails loudly at
 * the first send instead of quietly delivering a magic link to a stranger.
 */
export const DEFAULT_VIRTUAL_USER_EMAIL_DOMAIN = 'virtualuser.invalid'

/**
 * The virtual users a run actually sees: every declaration, with its address filled
 * in.
 *
 * Every consumer resolves through here rather than reading the definitions
 * directly, because the address is the part nobody declares and everybody
 * needs — codegen writes it into `virtualUserConfigs`, the seed creates the user
 * rows from it, and both `scenario run` and `virtualUser run` sign in with it.
 * Computing it in three places is how two of them end up disagreeing.
 */
export const resolveVirtualUsers = (
  definitions: VirtualUserDefinitions,
  domain: string = DEFAULT_VIRTUAL_USER_EMAIL_DOMAIN,
  runId?: string
): Record<string, ResolvedVirtualUser> => {
  const meta: VirtualUsersMeta = validateAndBuildVirtualUsersMeta(definitions)
  const ids = Object.keys(meta)
  const emails = virtualUserEmails(ids, domain, runId)

  const resolved: Record<string, ResolvedVirtualUser> = {}
  for (const id of ids) {
    resolved[id] = { ...(meta[id] as VirtualUserMeta), email: emails[id]! }
  }
  return resolved
}

/**
 * Re-exported rather than declared here: the scaffolded `runVirtualUser` RPC
 * needs the same expansion at runtime, so it lives in core beside
 * `prepareVirtualUserRun` and this keeps the CLI's existing import sites.
 */
export { virtualUserScopes } from '@pikku/core/virtual-user'
