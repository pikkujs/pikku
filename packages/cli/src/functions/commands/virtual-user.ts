import { resolve, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku/function'
import {
  createHttpVirtualUsers,
  statementSignIn,
  virtualUserEnvironmentRefusal,
  roleMismatchMessage,
  verifyVirtualUserRoles,
} from '@pikku/core/virtual-user'
import {
  virtualUserTarget,
  runVirtualUser,
  type VirtualUserDisposition,
  catalogueClassification,
  DISPOSITIONS,
  prepareVirtualUserRun,
} from '@pikku/core/virtual-user'
import { getSingletonServices, setSingletonServices } from '@pikku/core/state'
import { PikkuError } from '@pikku/core/errors'

import { resolveVirtualUsers } from '../../utils/resolve-virtual-users.js'
import {
  resolveStatementMint,
  runtimeDirOf,
} from '../../utils/virtual-user-signer.js'
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
 * Run one declared virtual user against a real stage, in character.
 *
 * Everything it needs is already in the project: the catalogue is the function
 * meta, the intents are the scenarios' own prose, the identity is the virtual user
 * signing in over the app's real auth, and the scopes come from the roles they
 * declared. The only new input is which person to be — everything else is a
 * flag for narrowing or replaying a run.
 *
 * This is deliberately not a test runner. It asserts nothing, and a green run
 * proves nothing — what it produces is findings, and the absence of them is
 * only ever "not this time, not with this seed".
 */
export const virtualUserRun = pikkuSessionlessFunc<
  {
    environment: string
    virtualUserId: string
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
      virtualUserId,
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
    const virtualUsers = resolveVirtualUsers(
      state.virtualUsers?.definitions ?? [],
      config.scenarios?.emailDomain
    )
    const known = Object.keys(virtualUsers)

    const virtualUser = virtualUsers[virtualUserId]
    if (!virtualUser) {
      throw new Error(
        `No virtual user '${virtualUserId}'.${
          known.length
            ? ` Declared: ${known.join(', ')}`
            : ' None are declared — add a defineVirtualUsers({ … }) call.'
        }`
      )
    }
    // A provider login needs a human at a consent screen, and someone declared
    // `runnable: false` exists to be acted upon. Refused here rather than
    // failing partway through a sign-in that was never going to work.
    if (!virtualUser.runnable) {
      throw new Error(
        `VirtualUser '${virtualUserId}' is not runnable — ${
          virtualUser.account?.provider
            ? `their login is a '${virtualUser.account.provider}' account, and driving its consent screen needs a person`
            : 'they are declared `runnable: false`, to be acted upon rather than to act'
        }.`
      )
    }

    const declared = dispositionFlag ?? virtualUser.disposition ?? 'realistic'
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
    // turn an accountable virtual user adversarial and point it at production. The
    // build check already looked at the declaration; this one exists because
    // the declaration is not what is running — the deployed artifact is.
    const refusal = virtualUserEnvironmentRefusal(
      virtualUserId,
      { ...virtualUser, disposition },
      environment,
      environments
    )
    if (refusal) {
      throw new Error(refusal)
    }

    const mint = await resolveStatementMint(variables, {
      apiUrl: env.apiUrl,
      runtimeDir: runtimeDirOf(config),
      what: 'a virtual user',
    })

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
    // through the `llm` handed to the engine, so a virtual user offered an agent
    // dies on its first word without this — and only for a virtual user whose
    // scopes reach one, which is why it survives a run as anybody else.
    setSingletonServices({ ...getSingletonServices(), agentRunner })

    // Shared with the scaffolded `runVirtualUser` RPC, which does the same
    // derivation from `metaService` at runtime — the two have to agree, or the
    // same virtual user and seed explore a different API depending on how it was
    // started.
    const { catalogue, intents, scopes, agents } = prepareVirtualUserRun({
      virtualUser,
      functionsMeta: state.functions?.meta ?? {},
      schemas: (state.schemas ?? {}) as Record<string, Record<string, unknown>>,
      workflowsMeta: state.workflows?.meta ?? {},
      systemRoles: state.systemRoles?.definitions ?? [],
      agentsMeta: state.agents?.agentsMeta ?? {},
    })
    if (catalogue.length === 0) {
      throw new PikkuError(
        'This project exposes no RPCs, so there is nothing for a virtual user to do.'
      )
    }

    const signedIn = createHttpVirtualUsers({
      apiUrl: env.apiUrl,
      signIn: statementSignIn({
        apiUrl: env.apiUrl,
        signInPath: env.signInPath,
        mint,
      }),
      virtualUsers,
      signInPath: env.signInPath,
      sessionPath: env.sessionPath,
      rpcPath: env.rpcPath,
      model: resolvedModel,
    })

    // Before the first step, not after: findings from a virtual user whose roles
    // drifted are about the seed, and reading them as product bugs is how a
    // whole run gets thrown away. `--skip-role-check` exists for a stage whose
    // auth reports roles somewhere this cannot read.
    if (!skipRoleCheck) {
      const actual = await signedIn[virtualUserId]!.sessionRoles()
      if (actual === null) {
        logger.warn(
          `Could not read '${virtualUserId}' roles back from ${env.apiUrl} — running unverified. ` +
            `A stage that does not report roles cannot tell a permissions finding from seed drift.`
        )
      } else {
        const message = roleMismatchMessage(
          verifyVirtualUserRoles(virtualUserId, virtualUser.roles, actual)
        )
        if (message) {
          // A refusal, not a crash: `PikkuError` is what tells the CLI to print
          // the message on its own, since the seed drift it names is the whole
          // finding and the frames underneath it are noise.
          throw new PikkuError(message)
        }
      }
    }

    const flagGoals = goals?.split(',').map((goal) => goal.trim())
    const result = await runVirtualUser({
      virtualUser,
      virtualUserId,
      disposition,
      // Tuning belongs to the declared person, so `--disposition` drops it: you
      // asked to run them differently, not to bend their dials to another shape.
      ...(dispositionFlag ? {} : { tuning: virtualUser.tuning }),
      catalogue,
      intents,
      goals: [...virtualUser.goals, ...(flagGoals ?? [])],
      scopes,
      fixtures: virtualUser.fixtures,
      // Both halves, or `talkTo` is wired up and never advertised: the target
      // decides whether a name is callable, the instructions are what tell the
      // virtual user the assistant exists at all.
      agents,
      target: virtualUserTarget(signedIn[virtualUserId]!, {
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
      virtualUser: `${virtualUser.name} (${virtualUserId})`,
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
export const virtualUserList = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState(true, false, false, true)
    const virtualUsers = Object.values(
      resolveVirtualUsers(
        state.virtualUsers?.definitions ?? [],
        config.scenarios?.emailDomain
      )
    )

    if (virtualUsers.length === 0) {
      logger.info(
        'No virtual users declared. Add a defineVirtualUsers({ susan: { name, roles, goals } }) call.'
      )
      return
    }

    for (const virtualUser of virtualUsers) {
      logger.info(
        `${virtualUser.id} — ${virtualUser.name}${virtualUser.jobTitle ? `, ${virtualUser.jobTitle}` : ''}`
      )
      logger.info(
        `  ${virtualUser.email}${
          virtualUser.roles.length
            ? `, roles: ${virtualUser.roles.join(', ')}`
            : ', no roles'
        }${virtualUser.runnable ? '' : ' (not runnable)'}`
      )
      if (virtualUser.disposition || virtualUser.tuning) {
        logger.info(
          `  ${virtualUser.disposition ?? 'realistic'}${
            virtualUser.tuning
              ? ` (tuned: ${describeTuning(virtualUser.tuning)})`
              : ''
          }`
        )
      }
      if (virtualUser.description) {
        logger.info(`  ${virtualUser.description}`)
      }
      for (const goal of virtualUser.goals) {
        logger.info(`  · ${goal}`)
      }
    }
  },
})
