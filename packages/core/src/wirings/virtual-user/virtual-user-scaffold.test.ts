import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  executeVirtualUserRun,
  logVirtualUserTick,
  requireVirtualUserRunStore,
  runnablePersona,
  serializeVirtualUserRun,
  serializeVirtualUserSchedule,
  serializeVirtualUserSteps,
  signInPathFor,
  startVirtualUserRun,
  virtualUserScheduleRunInput,
  writeVirtualUserSchedule,
  type ScaffoldPersonas,
} from './virtual-user-scaffold.js'
import type {
  VirtualUserRunRecord,
  VirtualUserRunStore,
} from './virtual-user-run-store.js'
import type {
  VirtualUserScheduleRecord,
  VirtualUserScheduleStore,
} from './virtual-user-schedule-store.js'

/**
 * These are the bodies of the scaffolded RPCs, so what is asserted here used to
 * be asserted by matching the generated source with a regular expression. The
 * properties are the same ones; the difference is that they are now checked by
 * running the code rather than by reading it.
 */

const personas = {
  susan: {
    id: 'susan',
    name: 'Susan',
    email: 'susan@actors.local',
    roles: [],
    goals: ['Get the weekly order in'],
    tags: [],
    runnable: true,
    disposition: 'realistic',
  },
  observed: {
    id: 'observed',
    name: 'Observed',
    email: 'observed@actors.local',
    roles: [],
    goals: [],
    tags: [],
    runnable: false,
  },
} as unknown as ScaffoldPersonas

const runStore = () => {
  const started: any[] = []
  const completed: any[] = []
  const failed: any[] = []
  const store = {
    start: async (start: any) => {
      started.push(start)
      return `run-${started.length}`
    },
    complete: async (runId: string, outcome: any) => {
      completed.push({ runId, outcome })
    },
    fail: async (runId: string, error: string) => {
      failed.push({ runId, error })
    },
    get: async () => null,
    list: async () => [],
    steps: async () => [],
  } as unknown as VirtualUserRunStore
  return { store, started, completed, failed }
}

const variables = (values: Record<string, string>) =>
  ({
    get: async (name: string) => values[name],
    getVariables: async () => ({}),
    getAll: async () => values,
    set: async () => {},
    has: async (name: string) => name in values,
    delete: async () => {},
  }) as any

const silentLogger = () => {
  const lines: string[] = []
  return {
    lines,
    logger: {
      debug: (m: string) => lines.push(`debug ${m}`),
      info: (m: string) => lines.push(`info ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
      error: (m: string) => lines.push(`error ${m}`),
    } as any,
  }
}

const emptyMeta = {
  getFunctionsMeta: async () => ({}),
  getSchemas: async () => ({}),
  getWorkflowMeta: async () => ({}),
  getSystemRolesMeta: async () => ({}),
  getAgentsMeta: async () => ({}),
} as any

describe('signInPathFor', () => {
  // Both are better-auth plugins on one mount, so an app that moved auth to
  // `/api/auth` should not have to name each door separately.
  test('an app that moved its auth mount moves both sign-in paths', () => {
    assert.equal(
      signInPathFor('/api/auth/sign-in/actor', 'fabric'),
      '/api/auth/sign-in/fabric'
    )
    assert.equal(
      signInPathFor('/api/auth/sign-in/fabric', 'actor'),
      '/api/auth/sign-in/actor'
    )
  })

  test('a path naming neither plugin was configured deliberately', () => {
    assert.equal(signInPathFor('/custom/login', 'actor'), '/custom/login')
  })

  test('nothing configured stays nothing, so the default applies', () => {
    assert.equal(signInPathFor(undefined, 'actor'), undefined)
  })
})

describe('runnablePersona', () => {
  test('an undeclared persona is named, with what declares one', () => {
    assert.throws(
      () => runnablePersona(personas, 'nobody'),
      /Unknown persona "nobody" — declare it with definePersonas\(\)/
    )
  })

  // An acted-upon persona has no session of its own, and running one races the
  // scenario that acts on it.
  test('refuses a persona that is declared as acted upon', () => {
    assert.throws(
      () => runnablePersona(personas, 'observed'),
      /declared as acted upon, never run/
    )
  })
})

describe('requireVirtualUserRunStore', () => {
  test('says which store to wire rather than failing on undefined', () => {
    assert.throws(
      () => requireVirtualUserRunStore(undefined),
      /KyselyVirtualUserRunStore/
    )
  })

  test('a read says there are no runs, not that one cannot be recorded', () => {
    assert.throws(
      () => requireVirtualUserRunStore(undefined, true),
      /there are no runs to read/
    )
  })
})

describe('startVirtualUserRun', () => {
  test('records the run before the caller gets the id back', async () => {
    const { store, started } = runStore()
    const run = await startVirtualUserRun({
      store,
      personas,
      config: undefined,
      persona: 'susan',
      startedBy: 'user-1',
    })
    assert.equal(run.runId, 'run-1')
    assert.equal(started.length, 1)
    assert.equal(started[0].persona, 'susan')
    assert.equal(started[0].startedBy, 'user-1')
  })

  // The seed is what makes a finding reproducible; deciding it inside the
  // engine would lose it whenever a run dies before returning.
  test('seeds the run before the record is written', async () => {
    const { store, started } = runStore()
    const run = await startVirtualUserRun({
      store,
      personas,
      config: undefined,
      persona: 'susan',
    })
    assert.equal(typeof started[0].seed, 'number')
    assert.equal(started[0].seed, run.seed)
  })

  test('a seed that was asked for is the one recorded', async () => {
    const { store, started } = runStore()
    await startVirtualUserRun({
      store,
      personas,
      config: undefined,
      persona: 'susan',
      seed: 42,
    })
    assert.equal(started[0].seed, 42)
  })

  test('the disposition falls back to what the persona declares', async () => {
    const { store, started } = runStore()
    await startVirtualUserRun({
      store,
      personas,
      config: undefined,
      persona: 'susan',
    })
    assert.equal(started[0].disposition, 'realistic')
  })

  test('refuses every disposition but the accountable one in production', async () => {
    const { store, started } = runStore()
    await assert.rejects(
      startVirtualUserRun({
        store,
        personas,
        config: { nodeEnv: 'production' },
        persona: 'susan',
        disposition: 'adversarial',
      }),
      /Only the 'accountable' disposition may run against production/
    )
    assert.equal(started.length, 0)
  })

  // Checked against the effective disposition, so an override cannot smuggle
  // one past a persona that declares the safe one.
  test('the accountable disposition is allowed through in production', async () => {
    const { store, started } = runStore()
    await startVirtualUserRun({
      store,
      personas,
      config: { nodeEnv: 'production' },
      persona: 'susan',
      disposition: 'accountable',
    })
    assert.equal(started[0].disposition, 'accountable')
  })

  test('refuses a persona that is declared as acted upon', async () => {
    const { store, started } = runStore()
    await assert.rejects(
      startVirtualUserRun({
        store,
        personas,
        config: undefined,
        persona: 'observed',
      }),
      /declared as acted upon, never run/
    )
    assert.equal(started.length, 0)
  })

  // A run record outlives the run and is read back over RPC, so a credential
  // stored on it is a credential anyone with read scope can collect. There is
  // no parameter to pass one in with, which is the guarantee.
  test('nothing credential-shaped reaches the record', async () => {
    const { store, started } = runStore()
    await startVirtualUserRun({
      store,
      personas,
      config: undefined,
      persona: 'susan',
    })
    assert.deepEqual(Object.keys(started[0]).sort(), [
      'disposition',
      'goals',
      'memory',
      'persona',
      'seed',
      'startedBy',
    ])
  })
})

const record = (): VirtualUserRunRecord =>
  ({
    runId: 'run-1',
    persona: 'susan',
    disposition: 'realistic',
    seed: 7,
    status: 'complete',
    goals: [],
    memory: {},
    findings: [
      {
        kind: 'a-kind-invented-tomorrow',
        detail: 'something',
        rpcName: 'getThing',
        status: 500,
        intentId: 'i1',
        step: 3,
      },
    ],
    intents: [
      {
        id: 'i1',
        sourceId: 's1',
        title: 'Buy a thing',
        status: 'done',
        steps: 3,
        suspensions: 0,
        summary: 'bought it',
      },
    ],
    tally: { steps: 3 },
    stoppedBy: null,
    error: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    finishedAt: new Date('2026-01-01T00:05:00.000Z'),
  }) as unknown as VirtualUserRunRecord

describe('serializeVirtualUserRun', () => {
  test('dates cross as strings, since a wire has no Date', () => {
    const wire = serializeVirtualUserRun(record())
    assert.equal(wire.createdAt, '2026-01-01T00:00:00.000Z')
    assert.equal(wire.finishedAt, '2026-01-01T00:05:00.000Z')
  })

  // A client built before a finding kind existed should still be able to read a
  // run that turned one up.
  test('leaves the finding kind open rather than enumerating today s kinds', () => {
    const wire = serializeVirtualUserRun(record())
    assert.equal(wire.findings[0]!.kind, 'a-kind-invented-tomorrow')
  })

  test('carries the seed out with the run, so a finding can be replayed', () => {
    assert.equal(serializeVirtualUserRun(record()).seed, 7)
  })

  test('a run still going has no finish time rather than a wrong one', () => {
    const wire = serializeVirtualUserRun({
      ...record(),
      finishedAt: null,
    } as VirtualUserRunRecord)
    assert.equal(wire.finishedAt, null)
  })
})

describe('serializeVirtualUserSteps', () => {
  test('a turn carries what it called, what came back, and what it cost', () => {
    const steps = serializeVirtualUserSteps([
      {
        index: 0,
        intentId: 'i1',
        action: { kind: 'call', rpcName: 'getThing' },
        status: 200,
        ok: true,
        response: '{}',
        findingKinds: ['slow'],
        tokensIn: 10,
        tokensOut: 20,
      },
    ] as any)
    assert.equal(steps.length, 1)
    assert.deepEqual(steps[0]!.action, { kind: 'call', rpcName: 'getThing' })
    assert.equal(steps[0]!.tokensIn, 10)
    assert.deepEqual(steps[0]!.findingKinds, ['slow'])
  })
})

const schedule = (): VirtualUserScheduleRecord =>
  ({
    persona: 'susan',
    enabled: true,
    disposition: 'adversarial',
    goals: ['Break checkout'],
    budget: { steps: 20, mutations: 5, duration: 600_000 },
    minIntervalMs: 3_600_000,
    maxIntervalMs: 7_200_000,
    nextRunAt: new Date('2026-01-02T00:00:00.000Z'),
    lastRunId: 'run-1',
    lastRunAt: new Date('2026-01-01T00:00:00.000Z'),
  }) as VirtualUserScheduleRecord

describe('serializeVirtualUserSchedule', () => {
  // A schedule is enabled once and then outlives the declaration it was written
  // from, so both sides have to travel for anyone to see they have parted ways.
  test('a schedule carries what the persona currently declares', () => {
    const wire = serializeVirtualUserSchedule(schedule(), personas)
    assert.equal(wire.disposition, 'adversarial')
    assert.equal(wire.declared.disposition, 'realistic')
    assert.deepEqual(wire.declared.goals, ['Get the weekly order in'])
  })

  // Which fields differ is a question about how to render two values, and the
  // answer belongs where they are rendered.
  test('the difference is left for the client to work out', () => {
    const wire = serializeVirtualUserSchedule(schedule(), personas)
    assert.equal('drifted' in wire, false)
  })

  test('the budget crosses as durationMs, which is what every call here takes', () => {
    const wire = serializeVirtualUserSchedule(schedule(), personas)
    assert.equal(wire.budget!.durationMs, 600_000)
  })

  // The engine's own duration also accepts `'30m'`, which nothing on this side
  // ever writes — so it is dropped rather than sent as a number it is not.
  test('a duration that is not a number does not cross as one', () => {
    const wire = serializeVirtualUserSchedule(
      {
        ...schedule(),
        budget: { steps: 1, mutations: 1, duration: '30m' },
      } as unknown as VirtualUserScheduleRecord,
      personas
    )
    assert.equal(wire.budget!.durationMs, undefined)
  })

  test('a persona nobody declares any more still renders', () => {
    const wire = serializeVirtualUserSchedule(
      { ...schedule(), persona: 'gone' } as VirtualUserScheduleRecord,
      personas
    )
    assert.equal(wire.declared.disposition, 'realistic')
    assert.deepEqual(wire.declared.goals, [])
  })
})

describe('writeVirtualUserSchedule', () => {
  const scheduleStore = () => {
    const writes: any[] = []
    return {
      writes,
      store: {
        set: async (input: any) => {
          writes.push(input)
          return { ...schedule(), ...input }
        },
        get: async () => null,
        list: async () => [],
        due: async () => [],
        claim: async () => true,
        remove: async () => {},
      } as unknown as VirtualUserScheduleStore,
    }
  }

  test('says which store to wire rather than failing on undefined', async () => {
    await assert.rejects(
      writeVirtualUserSchedule({
        store: undefined,
        personas,
        persona: 'susan',
      }),
      /KyselyVirtualUserScheduleStore/
    )
  })

  // The same rule a run enforces, applied at the point the row is written
  // rather than every hour afterwards.
  test('refuses a cadence for a persona that is only ever acted upon', async () => {
    const { store, writes } = scheduleStore()
    await assert.rejects(
      writeVirtualUserSchedule({ store, personas, persona: 'observed' }),
      /declared as acted upon, never run/
    )
    assert.equal(writes.length, 0)
  })

  test('durationMs is written as the budget duration the engine reads', async () => {
    const { store, writes } = scheduleStore()
    await writeVirtualUserSchedule({
      store,
      personas,
      persona: 'susan',
      budget: { steps: 3, durationMs: 1_000 },
    })
    assert.deepEqual(writes[0].budget, {
      steps: 3,
      mutations: undefined,
      duration: 1_000,
    })
  })

  // Clearing a budget and leaving it alone are different writes, and both have
  // to survive the mapping.
  test('an absent budget is left alone and a null one is cleared', async () => {
    const { store, writes } = scheduleStore()
    await writeVirtualUserSchedule({ store, personas, persona: 'susan' })
    assert.equal(writes[0].budget, undefined)
    await writeVirtualUserSchedule({
      store,
      personas,
      persona: 'susan',
      budget: null,
    })
    assert.equal(writes[1].budget, null)
  })

  test('a next run time crosses as a string and is stored as a date', async () => {
    const { store, writes } = scheduleStore()
    await writeVirtualUserSchedule({
      store,
      personas,
      persona: 'susan',
      nextRunAt: '2026-03-01T00:00:00.000Z',
    })
    assert.ok(writes[0].nextRunAt instanceof Date)
    assert.equal(writes[0].nextRunAt.toISOString(), '2026-03-01T00:00:00.000Z')
  })
})

describe('virtualUserScheduleRunInput', () => {
  // The tick starts a run through the same gated entry point a person calls, so
  // what it sends has to be the shape that entry point takes.
  test('a due schedule becomes the input runVirtualUser accepts', () => {
    const input = virtualUserScheduleRunInput(schedule())
    assert.deepEqual(input, {
      persona: 'susan',
      disposition: 'adversarial',
      goals: ['Break checkout'],
      budget: { steps: 20, mutations: 5, durationMs: 600_000 },
    })
  })

  test('no budget on the row means no budget on the run', () => {
    const input = virtualUserScheduleRunInput({
      ...schedule(),
      budget: null,
    } as VirtualUserScheduleRecord)
    assert.equal(input.budget, undefined)
  })
})

describe('logVirtualUserTick', () => {
  // The caller is a cron, so a run this started is otherwise the only trace
  // that a persona is still out there working.
  test('everything a tick did is written down, since nobody is watching', () => {
    const { logger, lines } = silentLogger()
    logVirtualUserTick(logger, {
      dispatched: [{ persona: 'susan', runId: 'run-9' }],
      reaped: ['run-8'],
      skipped: [{ persona: 'observed', reason: 'not due' }],
    } as any)
    assert.equal(lines.length, 3)
    assert.match(lines[0]!, /^info Virtual user susan started run run-9/)
    assert.match(lines[1]!, /^warn Virtual user run run-8 was abandoned/)
    assert.match(lines[2]!, /^info Virtual user observed skipped this tick/)
  })
})

describe('executeVirtualUserRun', () => {
  const params = (overrides: Record<string, unknown> = {}) => {
    const { store, completed, failed } = runStore()
    const { logger, lines } = silentLogger()
    return {
      completed,
      failed,
      lines,
      params: {
        runStore: store,
        metaService: emptyMeta,
        agentRunner: { run: async () => ({}) } as any,
        variables: variables({}),
        logger,
        personas,
        createPersonas: () => ({}) as any,
        runId: 'run-1',
        persona: 'susan',
        disposition: 'realistic',
        goals: [],
        memory: {},
        seed: 1,
        ...overrides,
      } as any,
    }
  }

  // The record is the only place a crashed run and a run that found nothing are
  // different states; leaving it at 'running' forever is what `fail` prevents.
  test('a run that cannot start is failed on the record, not left running', async () => {
    const { params: p, failed, lines } = params()
    await assert.rejects(
      executeVirtualUserRun(p),
      /VIRTUAL_USER_API_URL is not set/
    )
    assert.equal(failed.length, 1)
    assert.equal(failed[0].runId, 'run-1')
    assert.match(failed[0].error, /VIRTUAL_USER_API_URL is not set/)
    assert.match(lines[0]!, /^error Virtual user run run-1 \(susan\) failed/)
  })

  test('says which credential is missing rather than assuming the local one', async () => {
    const { params: p } = params({
      variables: variables({ VIRTUAL_USER_API_URL: 'http://localhost:4000' }),
    })
    await assert.rejects(
      executeVirtualUserRun(p),
      /Neither an operator token nor SCENARIO_ACTOR_SECRET is available/
    )
  })

  test('a model to think with is not assumed either', async () => {
    const { params: p } = params({
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        SCENARIO_ACTOR_SECRET: 'shh',
      }),
    })
    await assert.rejects(
      executeVirtualUserRun(p),
      /VIRTUAL_USER_MODEL is not set/
    )
  })

  // Asymmetric, so the stage can verify one and can never mint one. The actor
  // secret is symmetric and only `pikku dev` serves the endpoint that takes it.
  test('an operator token wins over the actor secret wherever both exist', async () => {
    let options: any
    const { params: p } = params({
      operatorToken: 'handed-in',
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        SCENARIO_ACTOR_SECRET: 'shh',
        VIRTUAL_USER_MODEL: 'a-model',
        SCENARIO_SIGN_IN_PATH: '/api/auth/sign-in/actor',
      }),
      createPersonas: (given: any) => {
        options = given
        return {}
      },
    })
    await assert.rejects(executeVirtualUserRun(p), /cannot sign in/)
    assert.equal(options.secret, undefined)
    assert.equal(options.operator.token, 'handed-in')
    assert.equal(options.operator.signInPath, '/api/auth/sign-in/fabric')
    // The actor door moves with the mount too, for the run that has no token.
    assert.equal(options.signInPath, '/api/auth/sign-in/actor')
  })

  test('a run nobody handed a token to falls back to the environment', async () => {
    let options: any
    const { params: p } = params({
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        FABRIC_OPERATOR_TOKEN: 'from-the-environment',
        VIRTUAL_USER_MODEL: 'a-model',
      }),
      createPersonas: (given: any) => {
        options = given
        return {}
      },
    })
    await assert.rejects(executeVirtualUserRun(p), /cannot sign in/)
    assert.equal(options.operator.token, 'from-the-environment')
  })

  test('with no token at all the actor secret is what signs in', async () => {
    let options: any
    const { params: p } = params({
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        SCENARIO_ACTOR_SECRET: 'shh',
        VIRTUAL_USER_MODEL: 'a-model',
      }),
      createPersonas: (given: any) => {
        options = given
        return {}
      },
    })
    await assert.rejects(executeVirtualUserRun(p), /cannot sign in/)
    assert.equal(options.secret, 'shh')
    assert.equal(options.operator, undefined)
  })

  test('a persona nobody declares any more is refused before signing in', async () => {
    let called = false
    const { params: p } = params({
      persona: 'gone',
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        SCENARIO_ACTOR_SECRET: 'shh',
        VIRTUAL_USER_MODEL: 'a-model',
      }),
      createPersonas: () => {
        called = true
        return {}
      },
    })
    await assert.rejects(
      executeVirtualUserRun(p),
      /Persona "gone" is no longer declared/
    )
    assert.equal(called, false)
  })

  // Reaching into pikku internals would make this a thing only the framework
  // can do, which is the opposite of a scaffold.
  test('derives everything through the public meta surface', async () => {
    const asked: string[] = []
    const { params: p } = params({
      metaService: {
        getFunctionsMeta: async () => {
          asked.push('functions')
          return {
            getThing: { inputSchemaName: 'GetThingInput' },
            other: { inputSchemaName: 'GetThingInput', outputSchemaName: null },
          }
        },
        getSchemas: async (names: string[]) => {
          asked.push(`schemas:${names.join(',')}`)
          return {}
        },
        getWorkflowMeta: async () => {
          asked.push('workflows')
          return {}
        },
        getSystemRolesMeta: async () => {
          asked.push('roles')
          return {}
        },
        getAgentsMeta: async () => {
          asked.push('agents')
          return {}
        },
      },
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        SCENARIO_ACTOR_SECRET: 'shh',
        VIRTUAL_USER_MODEL: 'a-model',
      }),
    })
    await assert.rejects(executeVirtualUserRun(p), /cannot sign in/)
    assert.ok(asked.includes('functions'))
    assert.ok(asked.includes('workflows'))
    assert.ok(asked.includes('roles'))
    assert.ok(asked.includes('agents'))
    // Only the schemas the catalogue can refer to, asked for once each — a
    // large app would otherwise pull every schema it has into one run.
    assert.ok(asked.includes('schemas:GetThingInput'))
  })

  // A budget of no steps runs the engine without letting it take a turn, which
  // is the cheapest way to prove the whole path down to the record.
  test('the transcript a run produced is stored, not discarded', async () => {
    const {
      params: p,
      completed,
      failed,
    } = params({
      budget: { steps: 0 },
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        SCENARIO_ACTOR_SECRET: 'shh',
        VIRTUAL_USER_MODEL: 'a-model',
      }),
      createPersonas: () => ({
        susan: {
          name: 'susan',
          email: 'susan@actors.local',
          invokeRaw: async () => ({ status: 200, body: {} }),
          converse: async () => ({
            passed: true,
            reasoning: '',
            transcript: [],
          }),
        },
      }),
    })
    const result = await executeVirtualUserRun(p)
    assert.equal(result.findings, 0)
    assert.equal(failed.length, 0)
    assert.equal(completed.length, 1)
    assert.equal(completed[0].runId, 'run-1')
    const outcome = completed[0].outcome
    assert.deepEqual(Object.keys(outcome).sort(), [
      'findings',
      'intents',
      'memory',
      'steps',
      'stoppedBy',
      'tally',
    ])
    assert.equal(outcome.stoppedBy, 'budget-steps')
  })

  test('nothing to think with is a wiring problem, said as one', async () => {
    const { params: p } = params({ agentRunner: undefined })
    await assert.rejects(executeVirtualUserRun(p), /agentRunner is not wired/)
  })

  test('nothing to derive from is a wiring problem, said as one', async () => {
    const { params: p } = params({ metaService: undefined })
    await assert.rejects(executeVirtualUserRun(p), /metaService is not wired/)
  })
})
