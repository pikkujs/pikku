import type { ResolvedPersona } from '@pikku/core/services'

/**
 * The runtime half of `definePersonas()`.
 *
 * Generated rather than re-exported because the addresses are computed: nobody
 * writes one down, and a seed, a scenario run and a virtual-user run all have
 * to arrive at the same one. Baking them here is what makes that a single fact
 * rather than three implementations of the same rule.
 */
export const serializePersonas = (
  personas: Record<string, ResolvedPersona>,
  agentMapImportPath: string,
  rpcMapImportPath: string
) => {
  return `/** Personas declared with definePersonas() */
import { createHttpPersonas } from '@pikku/core/persona'
import type { HttpPersonasConfig } from '@pikku/core/persona'
import type { ScenarioPersona, ResolvedPersona } from '@pikku/core/services'
import type { AgentMap } from '${agentMapImportPath}'
import type { FlattenedRPCMap } from '${rpcMapImportPath}'

export const personaConfigs = ${JSON.stringify(personas, null, 2)} as const satisfies Record<string, ResolvedPersona>

export type PersonaName = keyof typeof personaConfigs

/**
 * The same personas as a list, widened to \`ResolvedPersona\`. Iterating
 * \`personaConfigs\` directly yields the literal type of each entry, on which an
 * optional field a persona did not declare does not exist — so a seed reading
 * \`roles\` off every persona needs this instead.
 */
export const personaList: ResolvedPersona[] = Object.values(personaConfigs)

export type AgentName = keyof AgentMap & string
export type TypedPersonas = Record<
  PersonaName,
  ScenarioPersona<AgentName, FlattenedRPCMap>
>

export const createPersonas = (
  options: Omit<HttpPersonasConfig, 'personas'>
): TypedPersonas =>
  createHttpPersonas({
    ...options,
    personas: personaConfigs,
  }) as TypedPersonas
`
}
