import type { PikkuCLIConfig } from '../../../../types/config.js'

export const serializeScenarioActors = (
  actors: NonNullable<NonNullable<PikkuCLIConfig['scenarios']>['actors']>,
  agentMapImportPath: string,
  rpcMapImportPath: string
) => {
  return `/** Scenario actors declared in pikku.config.json (\`scenarios.actors\`) */
import {
  createHttpScenarioActors,
  type HttpScenarioActorsConfig,
  type ScenarioActor,
  type ScenarioActorConfig,
} from '@pikku/core/services'
import type { AgentMap } from '${agentMapImportPath}'
import type { FlattenedRPCMap } from '${rpcMapImportPath}'

export const scenarioActorConfigs = ${JSON.stringify(actors, null, 2)} as const satisfies Record<string, ScenarioActorConfig>

export type ScenarioActorName = keyof typeof scenarioActorConfigs

/**
 * The same registry as a list, widened to \`ScenarioActorConfig\`. Iterating
 * \`scenarioActorConfigs\` directly yields the literal type of each entry, on
 * which an optional field an actor did not declare does not exist — so a seed
 * reading \`scopes\`/\`roles\` off every actor needs this instead.
 */
export const scenarioActorList: ScenarioActorConfig[] = Object.values(
  scenarioActorConfigs
)

export type AgentName = keyof AgentMap & string
export type TypedScenarioActors = Record<
  ScenarioActorName,
  ScenarioActor<AgentName, FlattenedRPCMap>
>

export const createScenarioActors = (
  options: Omit<HttpScenarioActorsConfig, 'actors'>
): TypedScenarioActors =>
  createHttpScenarioActors({
    ...options,
    actors: scenarioActorConfigs,
  }) as TypedScenarioActors
`
}
