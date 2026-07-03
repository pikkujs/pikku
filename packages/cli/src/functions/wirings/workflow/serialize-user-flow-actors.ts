import type { PikkuCLIConfig } from '../../../../types/config.js'

/**
 * Generate the typed user-flow actor registry from pikku.config.json's
 * `userFlows.actors`. Apps wire the result as the `actors` singleton service:
 *
 *   actors: createUserFlowActors({ apiUrl, secret })
 */
export const serializeUserFlowActors = (
  actors: NonNullable<NonNullable<PikkuCLIConfig['userFlows']>['actors']>,
  agentMapImportPath: string
) => {
  return `/**
 * User-flow actors declared in pikku.config.json (\`userFlows.actors\`).
 * Any user flow can impersonate any actor.
 */
import {
  createHttpUserFlowActors,
  type HttpUserFlowActorsConfig,
  type UserFlowActor,
  type UserFlowActorConfig,
} from '@pikku/core/services'
import type { AgentMap } from '${agentMapImportPath}'

export const userFlowActorConfigs = ${JSON.stringify(actors, null, 2)} as const satisfies Record<string, UserFlowActorConfig>

export type UserFlowActorName = keyof typeof userFlowActorConfigs

/** \`actor.converse({ agent })\` is constrained to the project's agent names. */
export type AgentName = keyof AgentMap & string
export type TypedUserFlowActors = Record<
  UserFlowActorName,
  UserFlowActor<AgentName>
>

/**
 * Build the injected \`actors\` service: one lazy HTTP actor per registry
 * entry, signing in via the Better Auth actor plugin on first invoke.
 */
export const createUserFlowActors = (
  options: Omit<HttpUserFlowActorsConfig, 'actors'>
): TypedUserFlowActors =>
  createHttpUserFlowActors({
    ...options,
    actors: userFlowActorConfigs,
  }) as TypedUserFlowActors
`
}
