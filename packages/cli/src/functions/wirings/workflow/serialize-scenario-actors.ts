import type { PikkuCLIConfig } from '../../../../types/config.js'

/**
 * Generate the typed scenario actor registry from pikku.config.json's
 * `scenarios.actors`. Apps wire the result as the `actors` singleton service:
 *
 *   actors: createScenarioActors({ apiUrl, secret })
 */
export const serializeScenarioActors = (
  actors: NonNullable<NonNullable<PikkuCLIConfig['scenarios']>['actors']>,
  agentMapImportPath: string
) => {
  return `/**
 * Scenario actors declared in pikku.config.json (\`scenarios.actors\`).
 * Any scenario can impersonate any actor.
 */
import {
  createHttpScenarioActors,
  type HttpScenarioActorsConfig,
  type ScenarioActor,
  type ScenarioActorConfig,
} from '@pikku/core/services'
import type { AgentMap } from '${agentMapImportPath}'

export const scenarioActorConfigs = ${JSON.stringify(actors, null, 2)} as const satisfies Record<string, ScenarioActorConfig>

export type ScenarioActorName = keyof typeof scenarioActorConfigs

/** \`actor.converse({ agent })\` is constrained to the project's agent names. */
export type AgentName = keyof AgentMap & string
export type TypedScenarioActors = Record<
  ScenarioActorName,
  ScenarioActor<AgentName>
>

/**
 * Build the injected \`actors\` service: one lazy HTTP actor per registry
 * entry, signing in via the Better Auth actor plugin on first invoke.
 */
export const createScenarioActors = (
  options: Omit<HttpScenarioActorsConfig, 'actors'>
): TypedScenarioActors =>
  createHttpScenarioActors({
    ...options,
    actors: scenarioActorConfigs,
  }) as TypedScenarioActors
`
}
