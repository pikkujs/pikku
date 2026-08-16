import type { FunctionsMeta } from '../../function/function-meta.types.js'
import type { WorkflowsMeta } from '../workflow/workflow.types.js'
import { flattenSystemRoleDefinitions } from '../role/validate-role-definitions.js'
import type {
  SystemRoleDefinitions,
  SystemRoleDefinitionsMeta,
} from '../role/role.types.js'
import {
  deriveCatalogue,
  deriveIntents,
  type SchemaMap,
} from './virtual-user-derive.js'
import {
  reachableAgents,
  type AgentReachability,
  type ReachableAgent,
} from './virtual-user-agents.js'
import type { ApiCatalogueEntry, IntentSource } from './virtual-user.types.js'

/**
 * The scopes a persona holds, resolved through its roles.
 *
 * Roles are the only thing a persona declares; scopes are what a function
 * checks. Narrowing a virtual user's catalogue needs the second, so the
 * expansion happens once, here, against the same `defineSystemRole` definitions
 * the seed grants from.
 */
export const personaScopes = (
  persona: { roles?: readonly string[] },
  roleScopes: Record<string, readonly string[]>
): string[] => {
  const scopes = new Set<string>()
  for (const role of persona.roles ?? []) {
    for (const scope of roleScopes[role] ?? []) {
      scopes.add(scope)
    }
  }
  return [...scopes].sort()
}

/** Everything a run needs that is derived rather than decided. */
export interface VirtualUserPreparation {
  /** Every RPC the app exposes, narrowed to what this persona can reach. */
  catalogue: ApiCatalogueEntry[]
  intents: IntentSource[]
  scopes: string[]
  agents: ReachableAgent[]
}

/**
 * Derive what a virtual user needs from what the project already generates.
 *
 * Shared because there are two callers with the same problem and different
 * sources for it: `pikku persona run` reads the inspector state at build time,
 * and the scaffolded `runVirtualUser` RPC reads `metaService` at runtime. They
 * must agree — a persona whose catalogue is narrower over RPC than on the CLI
 * finds different things from the same seed, which is exactly the property a
 * seed exists to give.
 *
 * Nothing here is authored for the virtual user's benefit: the function meta is
 * the catalogue, the scenario meta is the intents, and the role definitions are
 * what turn a persona's declared roles into the scopes a function checks.
 */
export const prepareVirtualUserRun = (input: {
  persona: { roles?: readonly string[] }
  functionsMeta: FunctionsMeta
  schemas?: SchemaMap
  workflowsMeta?: WorkflowsMeta
  /**
   * Either shape: the inspector holds an array, `metaService` hands back the
   * same definitions keyed by name. Accepting both is what lets the CLI and the
   * scaffolded RPC share this.
   */
  systemRoles?: SystemRoleDefinitions | SystemRoleDefinitionsMeta
  agentsMeta?: Readonly<Record<string, AgentReachability>>
}): VirtualUserPreparation => {
  const catalogue = deriveCatalogue(input.functionsMeta, input.schemas ?? {})
  const intents = deriveIntents(input.workflowsMeta ?? {}, input.functionsMeta)

  const declared = input.systemRoles ?? []
  const roleScopes: Record<string, string[]> = {}
  for (const role of flattenSystemRoleDefinitions(
    Array.isArray(declared) ? declared : Object.values(declared)
  )) {
    roleScopes[role.name] = role.scopes
  }
  const scopes = personaScopes(input.persona, roleScopes)

  // Gated by the same scopes as the RPCs, because an agent is reached rather
  // than declared: `CoreAgent.scopes` is checked against the session, so a
  // persona finds the specialists its roles unlock and no others.
  const agents = reachableAgents(input.agentsMeta ?? {}, scopes)

  return { catalogue, intents, scopes, agents }
}
