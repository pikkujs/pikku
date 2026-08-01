import { resolve, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku'
import { createHttpScenarioActors } from '@pikku/core/services'
import {
  actorVirtualUserTarget,
  catalogueClassification,
  deriveCatalogue,
  deriveIntents,
  DISPOSITIONS,
  runVirtualUser,
  type VirtualUserDisposition,
  type VirtualUserMeta,
  type VirtualUsersMeta,
} from '@pikku/core/virtual-user'

import { resolveScenarioActors } from '../../utils/resolve-scenario-actors.js'
import { buildVirtualUsersMeta } from '../wirings/scenarios/serialize-virtual-user-meta.js'
import { resolveScenarioEnvironment } from './scenario-environment.js'
import { createDevAIAgentRunner } from './dev-ai-runner.js'
import { formatVirtualUserReport } from './virtual-user-formatter.js'

const dispositionNames = Object.keys(DISPOSITIONS)

/**
 * The declaration a run starts from, if any.
 *
 * A run can come from a `pikkuVirtualUser` export, from flags alone, or from a
 * declaration with flags on top — `--seed`, `--steps` and a different
 * `--disposition` are exactly what you reach for when reproducing or narrowing
 * a run, and having to edit the source to do it would be absurd.
 */
const resolveDeclaration = (
  declared: VirtualUsersMeta,
  name: string | undefined
): VirtualUserMeta | undefined => {
  if (!name) {
    return undefined
  }
  const virtualUser = declared[name]
  if (!virtualUser) {
    const known = Object.keys(declared)
    throw new Error(
      `No virtual user '${name}'.${
        known.length
          ? ` Declared: ${known.join(', ')}`
          : ' None are declared — add a pikkuVirtualUser() export, or pass --actor.'
      }`
    )
  }
  return virtualUser
}

/**
 * Run one virtual user against a real stage.
 *
 * Everything it needs is already in the project: the catalogue is the function
 * meta, the intents are the scenarios' own prose, the identity is a scenario
 * actor signing in over the app's real auth. The only new input is which actor
 * to be and how it should behave — declared as a `pikkuVirtualUser`, or given
 * as flags for a one-off.
 *
 * This is deliberately not a test runner. It asserts nothing, and a green run
 * proves nothing — what it produces is findings, and the absence of them is
 * only ever "not this time, not with this seed".
 */
export const virtualUserRun = pikkuSessionlessFunc<
  {
    environment: string
    name?: string
    actor?: string
    disposition?: string
    goals?: string
    steps?: string
    mutations?: string
    duration?: string
    seed?: string
    model?: string
    apiUrl?: string
    allowApproval?: boolean
    out?: string
  },
  void
>({
  func: async (
    { logger, config, getInspectorState, variables },
    {
      environment,
      name,
      actor: actorFlag,
      disposition: dispositionFlag,
      goals,
      steps,
      mutations,
      duration,
      seed,
      model,
      apiUrl,
      allowApproval,
      out,
    }
  ) => {
    const state = await getInspectorState(true, false, false, true)
    const declared = buildVirtualUsersMeta(state.workflows?.virtualUserFiles ?? new Map())
    const declaration = resolveDeclaration(declared, name)

    const actor = actorFlag ?? declaration?.actor
    const disposition =
      dispositionFlag ?? declaration?.disposition ?? 'realistic'
    if (!dispositionNames.includes(disposition)) {
      throw new Error(
        `Unknown disposition '${disposition}'. One of: ${dispositionNames.join(', ')}`
      )
    }

    const env = resolveScenarioEnvironment({
      environment,
      environments: config.scenarios?.environments ?? {},
      apiUrl,
    })

    const scenarioActors = resolveScenarioActors(config.scenarios)
    const knownActors = Object.keys(scenarioActors)
    if (!actor) {
      const knownUsers = Object.keys(declared)
      throw new Error(
        `Which user should this be? Name a declared one${
          knownUsers.length ? ` (${knownUsers.join(', ')})` : ''
        }, or pass --actor.${knownActors.length ? ` Actors: ${knownActors.join(', ')}` : ''}`
      )
    }
    const actorConfig = scenarioActors[actor]
    if (!actorConfig) {
      throw new Error(
        `No scenario actor '${actor}'.${knownActors.length ? ` Declared: ${knownActors.join(', ')}` : ' None are declared in pikku.config.json.'}`
      )
    }

    const secret = await variables.get('SCENARIO_ACTOR_SECRET')
    if (!secret) {
      throw new Error(
        'SCENARIO_ACTOR_SECRET is not set — a virtual user cannot sign in. ' +
          'Export it in the environment running this command (never put it in pikku.config.json).'
      )
    }

    const resolvedModel = model ?? config.scenarios?.model
    if (!resolvedModel) {
      throw new Error(
        'No model to think with — pass --model, or set scenarios.model in pikku.config.json.'
      )
    }
    const aiAgentRunner = await createDevAIAgentRunner({
      logger,
      projectRoot: config.rootDir,
      variables,
    })
    if (!aiAgentRunner) {
      throw new Error(
        'No AI provider is configured. Set OPENAI_BASE_URL + OPENAI_API_KEY (or LITELLM_PROXY_URL + LITELLM_API_KEY).'
      )
    }

    const functionsMeta = state.functions?.meta ?? {}
    const catalogue = deriveCatalogue(
      functionsMeta,
      (state.schemas ?? {}) as Record<string, Record<string, unknown>>
    )
    if (catalogue.length === 0) {
      throw new Error(
        'This project exposes no RPCs, so there is nothing for a virtual user to do.'
      )
    }
    const intents = deriveIntents(state.workflows?.meta ?? {}, functionsMeta)
    const agents = Object.keys(state.agents?.agentsMeta ?? {})

    const actors = createHttpScenarioActors({
      apiUrl: env.apiUrl,
      secret,
      actors: scenarioActors,
      signInPath: env.signInPath,
      rpcPath: env.rpcPath,
      model: resolvedModel,
    })

    const flagGoals = goals?.split(',').map((goal) => goal.trim())
    const result = await runVirtualUser({
      actor: actorConfig,
      actorName: actor,
      disposition: disposition as VirtualUserDisposition,
      catalogue,
      intents,
      goals: [...(declaration?.goals ?? []), ...(flagGoals ?? [])],
      grants: declaration?.grants,
      fixtures: declaration?.fixtures,
      target: actorVirtualUserTarget(actors[actor]!, {
        model: resolvedModel,
        agents,
      }),
      llm: (params) => aiAgentRunner.run(params),
      model: resolvedModel,
      seed: seed ? Number(seed) : undefined,
      allowApprovalRequired:
        allowApproval ?? declaration?.allowApprovalRequired ?? false,
      budget: {
        steps: steps ? Number(steps) : declaration?.budget?.steps,
        mutations: mutations
          ? Number(mutations)
          : declaration?.budget?.mutations,
        duration: duration ?? declaration?.budget?.duration,
      },
    })

    for (const { level, text } of formatVirtualUserReport(result, {
      actor: declaration ? `${declaration.name} (${actor})` : actor,
      disposition,
      environment,
      apiUrl: env.apiUrl,
      catalogue: catalogueClassification(catalogue),
    })) {
      logger[level](text)
    }

    if (out) {
      const path = resolve(config.rootDir, out)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(result, null, 2))
      logger.info(`Wrote the full run to ${path}`)
    }

    // A finding is the whole reason this ran, so it has to be able to fail a
    // pipeline. Nothing else here does: giving up on an intent is a user being
    // a user, not a defect.
    if (result.findings.length > 0) {
      process.exitCode = 1
    }
  },
})

/** What is declared, and what each one would do, without running anything. */
export const virtualUserList = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, getInspectorState }) => {
    const state = await getInspectorState(true, false, false, true)
    const declared = buildVirtualUsersMeta(
      state.workflows?.virtualUserFiles ?? new Map()
    )
    const users = Object.values(declared)

    if (users.length === 0) {
      logger.info(
        'No virtual users declared. Export a pikkuVirtualUser({ actor, disposition, goals }) to add one.'
      )
      return
    }

    for (const user of users) {
      logger.info(`${user.id} — ${user.name}`)
      logger.info(`  ${user.actor}, ${user.disposition}`)
      if (user.description) {
        logger.info(`  ${user.description}`)
      }
      for (const goal of user.goals) {
        logger.info(`  · ${goal}`)
      }
    }
  },
})
