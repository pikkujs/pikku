import type { PikkuCLIConfig } from '../../../../types/config.js'

export const serializeScenarioActors = (
  actors: NonNullable<NonNullable<PikkuCLIConfig['scenarios']>['actors']>,
  agentMapImportPath: string
) => {
  return `/** Scenario actors declared in pikku.config.json (\`scenarios.actors\`) */
import {
  createHttpScenarioActors,
  type HttpScenarioActorsConfig,
  type ScenarioActor,
  type ScenarioActorConfig,
} from '@pikku/core/services'
import type { AgentMap } from '${agentMapImportPath}'

export const scenarioActorConfigs = ${JSON.stringify(actors, null, 2)} as const satisfies Record<string, ScenarioActorConfig>

export type ScenarioActorName = keyof typeof scenarioActorConfigs

export type AgentName = keyof AgentMap & string
export type TypedScenarioActors = Record<
  ScenarioActorName,
  ScenarioActor<AgentName>
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
