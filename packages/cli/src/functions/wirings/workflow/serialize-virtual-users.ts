import type { VirtualUserEnvironment } from '@pikku/core/virtual-user'
import type { ResolvedVirtualUser } from '@pikku/core/services'

/**
 * The runtime half of `defineVirtualUsers()`.
 *
 * Generated rather than re-exported because the addresses are computed: nobody
 * writes one down, and a seed, a scenario run and a virtual-user run all have
 * to arrive at the same one. Baking them here is what makes that a single fact
 * rather than three implementations of the same rule.
 */
export const serializeVirtualUsers = (
  virtualUsers: Record<string, ResolvedVirtualUser>,
  agentMapImportPath: string,
  rpcMapImportPath: string,
  environments: Readonly<Record<string, VirtualUserEnvironment>> = {}
) => {
  // Only the flag the rule reads. The rest of an environment entry is its
  // apiUrl and paths, which belong to the machine running `pikku scenario` and
  // have no business inside the deployed bundle.
  const projected = Object.fromEntries(
    Object.entries(environments).map(([name, environment]) => [
      name,
      environment.production ? { production: true } : {},
    ])
  )

  return `/** Virtual users declared with defineVirtualUsers() */
import { createHttpVirtualUsers } from '@pikku/core/virtual-user'
import type { HttpVirtualUsersConfig } from '@pikku/core/virtual-user'
import type { ScenarioVirtualUser } from '@pikku/core/services'
import type { ResolvedVirtualUser } from '@pikku/core/services'
import type { AgentMap } from '${agentMapImportPath}'
import type { FlattenedRPCMap } from '${rpcMapImportPath}'

export const virtualUserConfigs = ${JSON.stringify(virtualUsers, null, 2)} as const satisfies Record<string, ResolvedVirtualUser>

export type VirtualUserName = keyof typeof virtualUserConfigs

/**
 * The same virtual users as a list, widened to \`ResolvedVirtualUser\`. Iterating
 * \`virtualUserConfigs\` directly yields the literal type of each entry, on which an
 * optional field a virtual user did not declare does not exist — so a seed reading
 * \`roles\` off every virtual user needs this instead.
 */
export const personaList: ResolvedVirtualUser[] = Object.values(virtualUserConfigs)

/**
 * The \`environments\` block of pikku.config.json, carried into the runtime.
 *
 * A virtual user's environments are checked twice: at build time against the config,
 * and again wherever a virtual user is signed in or provisioned, against the
 * environment the running process says it is (\`PIKKU_ENV\`). The second check
 * is not the first one repeated — the build check trusts the file, and the run
 * check does not trust which artifact got deployed — so the rule needs the
 * config on both sides of the build.
 */
export const virtualUserEnvironments = ${JSON.stringify(projected, null, 2)} as const satisfies Record<string, { production?: boolean }>

export type AgentName = keyof AgentMap & string
/**
 * The virtual users this project declares, keyed by name — the \`actors\` a scenario
 * step runs as.
 */
export type TypedVirtualUsers = Record<
  VirtualUserName,
  ScenarioVirtualUser<AgentName, FlattenedRPCMap>
>

export const createVirtualUsers = (
  options: Omit<HttpVirtualUsersConfig, 'virtualUsers'>
): TypedVirtualUsers =>
  createHttpVirtualUsers({
    ...options,
    virtualUsers: virtualUserConfigs,
  }) as TypedVirtualUsers
`
}
