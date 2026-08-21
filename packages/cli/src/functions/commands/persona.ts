import { resolve, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku/function'
import {
  createHttpPersonas,
  personaEnvironmentRefusal,
  roleMismatchMessage,
  verifyPersonaRoles,
} from '@pikku/core/persona'
import {
  personaVirtualUserTarget,
  runVirtualUser,
  type VirtualUserDisposition,
  catalogueClassification,
  DISPOSITIONS,
  prepareVirtualUserRun,
} from '@pikku/core/virtual-user'
import { getSingletonServices, setSingletonServices } from '@pikku/core/state'

import { resolvePersonas } from '../../utils/resolve-personas.js'
import { resolveEnvironment } from './environment.js'
import { createDevAgentRunner } from './dev-agent-runner.js'
import { formatVirtualUserReport } from './virtual-user-formatter.js'

const dispositionNames = Object.keys(DISPOSITIONS)

/**
 * What a declaration overrode, in the order it was written.
 *
 * Listed rather than summarised as "tuned": the whole reason to override a dial
 * is that the stock profile was wrong for this product, and which one you moved
 * is the interesting part.
 */
const describeTuning = (tuning: object): string =>
  Object.entries(tuning)
    .map(([dial, value]) =>
      dial === 'moves' && value && typeof value === 'object'
        ? Object.entries(value)
            .map(([move, weight]) => `${move} ${weight}`)
            .join(', ')
        : `${dial} ${dial === 'instructions' ? '+' : value}`
    )
    .join(', ')

/**
 * Run one declared persona against a real stage as a virtual user.
 *
 * Everything it needs is already in the project: the catalogue is the function
 * meta, the intents are the scenarios' own prose, the identity is the persona
 * signing in over the app's real auth, and the scopes come from the roles they
 * declared. The only new input is which person to be — everything else is a
 * flag for narrowing or replaying a run.
 *
 * This is deliberately not a test runner. It asserts nothing, and a green run
 * proves nothing — what it produces is findings, and the absence of them is
 * only ever "not this time, not with this seed".
 */
export const personaRun = pikkuSessionlessFunc<
  {
    environment: string
    persona: string
    disposition?: string
    goals?: string
    steps?: string
    mutations?: string
    duration?: string
    seed?: string
    model?: string
    apiUrl?: string
    allowApproval?: boolean
    skipRoleCheck?: boolean
    out?: string
  },
  void
>({
  func: async (
    { logger, config, getInspectorState, variables },
    {
      environment,
      persona: personaId,
      disposition: dispositionFlag,
      goals,
      steps,
      mutations,
      duration,
      seed,
      model,
      apiUrl,
      allowApproval,
      skipRoleCheck,
      out,
    }
  ) => {
    const state = await getInspectorState(true, false, false, true)
    const personas = resolvePersonas(
      state.personas?.definitions ?? [],
      config.scenarios?.emailDomain
    )
    const known = Object.keys(personas)

    const persona = personas[personaId]
    if (!persona) {
      throw new Error(
        `No persona '${personaId}'.${
          known.length
            ? ` Declared: ${known.join(', ')}`
            : ' None are declared — add a definePersonas({ … }) call.'
        }`
      )
    }
    // A provider login needs a human at a consent screen, and someone declared
    // `runnable: false` exists to be acted upon. Refused here rather than
    // failing partway through a sign-in that was never going to work.
    if (!persona.runnable) {
      throw new Error(
        `Persona '${personaId}' is not runnable — ${
          persona.account?.provider
            ? `their login is a '${persona.account.provider}' account, and driving its consent screen needs a person`
            : 'they are declared `runnable: false`, to be acted upon rather than to act'
        }.`
      )
    }

    const declared = dispositionFlag ?? persona.disposition ?? 'realistic'
    if (!dispositionNames.includes(declared)) {
      throw new Error(
        `Unknown disposition '${declared}'. One of: ${dispositionNames.join(', ')}`
      )
    }
    // Narrowed by the guard above; `dispositionNames` is the runtime list and
    // does not carry the union through `includes`.
    const disposition = declared as VirtualUserDisposition

    const environments = config.environments ?? {}
    const env = resolveEnvironment({
      environment,
      environments,
      apiUrl,
    })

    // Checked against the *effective* disposition, so `--disposition` cannot
    // turn an accountable persona adversarial and point it at production. The
    // build check already looked at the declaration; this one exists because
    // the declaration is not what is running — the deployed artifact is.
    const refusal = personaEnvironmentRefusal(
      personaId,
      { ...persona, disposition },
      environment,
      environments
    )
    if (refusal) {
      throw new Error(refusal)
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
    const agentRunner = await createDevAgentRunner({
      logger,
      projectRoot: config.rootDir,
      variables,
    })
    if (!agentRunner) {
      throw new Error(
        'No AI provider is configured. Set OPENAI_BASE_URL + OPENAI_API_KEY (or LITELLM_PROXY_URL + LITELLM_API_KEY).'
      )
    }
    // `talkTo` reaches the runner through the singleton registry rather than
    // through the `llm` handed to the engine, so a persona offered an agent
    // dies on its first word without this — and only for a persona whose
    // scopes reach one, which is why it survives a run as anybody else.
    setSingletonServices({ ...getSingletonServices(), agentRunner })

    // Shared with the scaffolded `runVirtualUser` RPC, which does the same
    // derivation from `metaService` at runtime — the two have to agree, or the
    // same persona and seed explore a different API depending on how it was
    // started.
    const { catalogue, intents, scopes, agents } = prepareVirtualUserRun({
      persona,
      functionsMeta: state.functions?.meta ?? {},
      schemas: (state.schemas ?? {}) as Record<string, Record<string, unknown>>,
      workflowsMeta: state.workflows?.meta ?? {},
      systemRoles: state.systemRoles?.definitions ?? [],
      agentsMeta: state.agents?.agentsMeta ?? {},
    })
    if (catalogue.length === 0) {
      throw new Error(
        'This project exposes no RPCs, so there is nothing for a virtual user to do.'
      )
    }

    const signedIn = createHttpPersonas({
      apiUrl: env.apiUrl,
      secret,
      personas,
      signInPath: env.signInPath,
      rpcPath: env.rpcPath,
      model: resolvedModel,
    })

    // Before the first step, not after: findings from a persona whose roles
    // drifted are about the seed, and reading them as product bugs is how a
    // whole run gets thrown away. `--skip-role-check` exists for a stage whose
    // auth reports roles somewhere this cannot read.
    if (!skipRoleCheck) {
      const actual = await signedIn[personaId]!.sessionRoles()
      if (actual === null) {
        logger.warn(
          `Could not read '${personaId}' roles back from ${env.apiUrl} — running unverified. ` +
            `A stage that does not report roles cannot tell a permissions finding from seed drift.`
        )
      } else {
        const message = roleMismatchMessage(
          verifyPersonaRoles(personaId, persona.roles, actual)
        )
        if (message) {
          throw new Error(message)
        }
      }
    }

    const flagGoals = goals?.split(',').map((goal) => goal.trim())
    const result = await runVirtualUser({
      persona,
      personaId,
      disposition,
      // Tuning belongs to the declared person, so `--disposition` drops it: you
      // asked to run them differently, not to bend their dials to another shape.
      ...(dispositionFlag ? {} : { tuning: persona.tuning }),
      catalogue,
      intents,
      goals: [...persona.goals, ...(flagGoals ?? [])],
      scopes,
      fixtures: persona.fixtures,
      // Both halves, or `talkTo` is wired up and never advertised: the target
      // decides whether a name is callable, the instructions are what tell the
      // persona the assistant exists at all.
      agents,
      target: personaVirtualUserTarget(signedIn[personaId]!, {
        model: resolvedModel,
        agents: agents.map((agent) => agent.name),
      }),
      llm: (params) => agentRunner.run(params),
      model: resolvedModel,
      seed: seed ? Number(seed) : undefined,
      allowApprovalRequired: allowApproval ?? false,
      budget: {
        steps: steps ? Number(steps) : undefined,
        mutations: mutations ? Number(mutations) : undefined,
        duration,
      },
    })

    for (const { level, text } of formatVirtualUserReport(result, {
      persona: `${persona.name} (${personaId})`,
      disposition,
      environment,
      apiUrl: env.apiUrl,
      catalogue: catalogueClassification(catalogue),
    })) {
      const write: (message: string) => void = logger[level].bind(logger)
      write(text)
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

/** Who this app is for, and what each of them wants, without running anything. */
export const personaList = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState(true, false, false, true)
    const personas = Object.values(
      resolvePersonas(
        state.personas?.definitions ?? [],
        config.scenarios?.emailDomain
      )
    )

    if (personas.length === 0) {
      logger.info(
        'No personas declared. Add a definePersonas({ susan: { name, roles, goals } }) call.'
      )
      return
    }

    for (const persona of personas) {
      logger.info(
        `${persona.id} — ${persona.name}${persona.jobTitle ? `, ${persona.jobTitle}` : ''}`
      )
      logger.info(
        `  ${persona.email}${
          persona.roles.length
            ? `, roles: ${persona.roles.join(', ')}`
            : ', no roles'
        }${persona.runnable ? '' : ' (not runnable)'}`
      )
      if (persona.disposition || persona.tuning) {
        logger.info(
          `  ${persona.disposition ?? 'realistic'}${
            persona.tuning ? ` (tuned: ${describeTuning(persona.tuning)})` : ''
          }`
        )
      }
      if (persona.description) {
        logger.info(`  ${persona.description}`)
      }
      for (const goal of persona.goals) {
        logger.info(`  · ${goal}`)
      }
    }
  },
})
