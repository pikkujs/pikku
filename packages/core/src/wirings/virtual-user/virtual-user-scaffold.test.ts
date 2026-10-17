import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  executeVirtualUserRun,
  logVirtualUserTick,
  requireVirtualUserRunStore,
  runnableVirtualUser,
  serializeVirtualUserRun,
  serializeVirtualUserSchedule,
  serializeVirtualUserSteps,
  startVirtualUserRun,
  virtualUserScheduleRunInput,
  writeVirtualUserSchedule,
  type ScaffoldVirtualUsers,
} from './virtual-user-scaffold.js'
import type {
  VirtualUserRunRecord,
  VirtualUserRunStore,
} from './virtual-user-run-store.js'
import type {
  VirtualUserScheduleRecord,
  VirtualUserScheduleStore,
} from './virtual-user-schedule-store.js'
import { createHttpVirtualUsers } from './http-virtual-users.js'
import { getErrorResponse } from '../../errors/error-handler.js'

/**
 * These are the bodies of the scaffolded RPCs, so what is asserted here used to
 * be asserted by matching the generated source with a regular expression. The
 * properties are the same ones; the difference is that they are now checked by
 * running the code rather than by reading it.
 */

const virtualUsers = {
  susan: {
    id: 'susan',
    name: 'Susan',
    email: 'susan@virtualuser.local',
    roles: [],
    goals: ['Get the weekly order in'],
    tags: [],
    runnable: true,
    disposition: 'realistic',
  },
  observed: {
    id: 'observed',
    name: 'Observed',
    email: 'observed@virtualuser.local',
    roles: [],
    goals: [],
    tags: [],
    runnable: false,
  },
} as unknown as ScaffoldVirtualUsers

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

describe('runnableVirtualUser', () => {
  test('an undeclared virtual user is named, with what declares one', () => {
    assert.throws(
      () => runnableVirtualUser(virtualUsers, 'nobody'),
      /Unknown virtual user "nobody" — declare it with defineVirtualUsers\(\)/
    )
  })

  // An acted-upon virtual user has no session of its own, and running one races the
  // scenario that acts on it.
  test('refuses a virtual user that is declared as acted upon', () => {
    assert.throws(
      () => runnableVirtualUser(virtualUsers, 'observed'),
      /declared as acted upon, never run/
    )
  })
})

// A refusal is the caller's to act on, so it has to reach them as a 4xx: a plain
// Error becomes a 500 whose body is only an errorId, and the console shows that
// and nothing else.
describe('refusals reach the caller', () => {
  const statusOf = async (run: () => unknown) => {
    try {
      await run()
    } catch (e) {
      return getErrorResponse(e)?.status
    }
    assert.fail('expected a refusal')
  }

  test('an undeclared virtual user is a 400', async () => {
    assert.equal(
      await statusOf(() => runnableVirtualUser(virtualUsers, 'nobody')),
      400
    )
  })

  test('an acted-upon virtual user is a 400', async () => {
    assert.equal(
      await statusOf(() => runnableVirtualUser(virtualUsers, 'observed')),
      400
    )
  })

  test('a probing disposition in production is a 403', async () => {
    const { store } = runStore()
    assert.equal(
      await statusOf(() =>
        startVirtualUserRun({
          store,
          virtualUsers,
          config: { nodeEnv: 'development' },
          environments: { production: { production: true } },
          environment: 'production',
          virtualUserId: 'susan',
          disposition: 'newcomer',
        })
      ),
      403
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
      virtualUsers,
      config: undefined,
      virtualUserId: 'susan',
      startedBy: 'user-1',
    })
    assert.equal(run.runId, 'run-1')
    assert.equal(started.length, 1)
    assert.equal(started[0].virtualUserId, 'susan')
    assert.equal(started[0].startedBy, 'user-1')
  })

  // The seed is what makes a finding reproducible; deciding it inside the
  // engine would lose it whenever a run dies before returning.
  test('seeds the run before the record is written', async () => {
    const { store, started } = runStore()
    const run = await startVirtualUserRun({
      store,
      virtualUsers,
      config: undefined,
      virtualUserId: 'susan',
    })
    assert.equal(typeof started[0].seed, 'number')
    assert.equal(started[0].seed, run.seed)
  })

  test('a seed that was asked for is the one recorded', async () => {
    const { store, started } = runStore()
    await startVirtualUserRun({
      store,
      virtualUsers,
      config: undefined,
      virtualUserId: 'susan',
      seed: 42,
    })
    assert.equal(started[0].seed, 42)
  })

  test('the disposition falls back to what the virtual user declares', async () => {
    const { store, started } = runStore()
    await startVirtualUserRun({
      store,
      virtualUsers,
      config: undefined,
      virtualUserId: 'susan',
    })
    assert.equal(started[0].disposition, 'realistic')
  })

  test('refuses every disposition in production', async () => {
    const { store, started } = runStore()
    await assert.rejects(
      startVirtualUserRun({
        store,
        virtualUsers,
        config: { nodeEnv: 'production' },
        virtualUserId: 'susan',
        disposition: 'adversarial',
      }),
      /Virtual users do not run against production/
    )
    assert.equal(started.length, 0)
  })

  test('the accountable disposition is refused in production too', async () => {
    const { store, started } = runStore()
    await assert.rejects(
      startVirtualUserRun({
        store,
        virtualUsers,
        config: { nodeEnv: 'production' },
        virtualUserId: 'susan',
        disposition: 'accountable',
      }),
      /Virtual users do not run against production/
    )
    assert.equal(started.length, 0)
  })

  // The case NODE_ENV cannot answer: a staging environment that is a production
  // mirror runs NODE_ENV=production too, and refusing every disposition there
  // refuses them on the one environment they exist to be used on.
  test('a non-production environment allows a probing disposition', async () => {
    const { store, started } = runStore()
    await startVirtualUserRun({
      store,
      virtualUsers,
      config: { nodeEnv: 'production' },
      environments: { staging: {}, production: { production: true } },
      environment: 'staging',
      virtualUserId: 'susan',
      disposition: 'adversarial',
    })
    assert.equal(started[0].disposition, 'adversarial')
  })

  test('the configured production environment still refuses one', async () => {
    const { store, started } = runStore()
    await assert.rejects(
      startVirtualUserRun({
        store,
        virtualUsers,
        config: { nodeEnv: 'development' },
        environments: { staging: {}, production: { production: true } },
        environment: 'production',
        virtualUserId: 'susan',
        disposition: 'adversarial',
      }),
      /Virtual users do not run against production/
    )
    assert.equal(started.length, 0)
  })

  // An environment nobody can name is one whose data nobody can vouch for.
  // PIKKU_ENV is cleared rather than passed as undefined: it is the default the
  // parameter falls back to, so leaving it set would test the wrong thing.
  test('an unresolved environment is treated as production', async () => {
    const { store, started } = runStore()
    const pikkuEnv = process.env.PIKKU_ENV
    delete process.env.PIKKU_ENV
    try {
      await assert.rejects(
        startVirtualUserRun({
          store,
          virtualUsers,
          config: { nodeEnv: 'development' },
          environments: { staging: {}, production: { production: true } },
          virtualUserId: 'susan',
          disposition: 'adversarial',
        }),
        /Virtual users do not run against production/
      )
    } finally {
      if (pikkuEnv !== undefined) process.env.PIKKU_ENV = pikkuEnv
    }
    assert.equal(started.length, 0)
  })

  test('refuses a virtual user that is declared as acted upon', async () => {
    const { store, started } = runStore()
    await assert.rejects(
      startVirtualUserRun({
        store,
        virtualUsers,
        config: undefined,
        virtualUserId: 'observed',
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
      virtualUsers,
      config: undefined,
      virtualUserId: 'susan',
    })
    assert.deepEqual(Object.keys(started[0]).sort(), [
      'disposition',
      'goals',
      'memory',
      'seed',
      'startedBy',
      'virtualUserId',
    ])
  })
})

const record = (): VirtualUserRunRecord =>
  ({
    runId: 'run-1',
    virtualUserId: 'susan',
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
    virtualUserId: 'susan',
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
  test('a schedule carries what the virtual user currently declares', () => {
    const wire = serializeVirtualUserSchedule(schedule(), virtualUsers)
    assert.equal(wire.disposition, 'adversarial')
    assert.equal(wire.declared.disposition, 'realistic')
    assert.deepEqual(wire.declared.goals, ['Get the weekly order in'])
  })

  // Which fields differ is a question about how to render two values, and the
  // answer belongs where they are rendered.
  test('the difference is left for the client to work out', () => {
    const wire = serializeVirtualUserSchedule(schedule(), virtualUsers)
    assert.equal('drifted' in wire, false)
  })

  test('the budget crosses as durationMs, which is what every call here takes', () => {
    const wire = serializeVirtualUserSchedule(schedule(), virtualUsers)
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
      virtualUsers
    )
    assert.equal(wire.budget!.durationMs, undefined)
  })

  test('a virtual user nobody declares any more still renders', () => {
    const wire = serializeVirtualUserSchedule(
      { ...schedule(), virtualUserId: 'gone' } as VirtualUserScheduleRecord,
      virtualUsers
    )
    assert.equal(wire.declared.disposition, 'realistic')
    assert.deepEqual(wire.declared.goals, [])
  })
})

describe('writeVirtualUserSchedule', () => {
  const scheduleStore = (existing: VirtualUserScheduleRecord | null = null) => {
    const writes: any[] = []
    return {
      writes,
      store: {
        set: async (input: any) => {
          writes.push(input)
          return { ...schedule(), ...input }
        },
        get: async () => existing,
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
        virtualUsers,
        virtualUserId: 'susan',
      }),
      /KyselyVirtualUserScheduleStore/
    )
  })

  // The same rule a run enforces, applied at the point the row is written
  // rather than every hour afterwards.
  test('refuses a cadence for a virtual user that is only ever acted upon', async () => {
    const { store, writes } = scheduleStore()
    await assert.rejects(
      writeVirtualUserSchedule({
        store,
        virtualUsers,
        virtualUserId: 'observed',
      }),
      /declared as acted upon, never run/
    )
    assert.equal(writes.length, 0)
  })

  // An enabled cadence production refuses is a tick that fails every time with
  // nobody watching, so it is refused when written instead.
  const production = {
    config: undefined,
    environments: { production: { production: true } },
    environment: 'production',
  }

  test('refuses enabling a cadence in production', async () => {
    const { store, writes } = scheduleStore()
    await assert.rejects(
      writeVirtualUserSchedule({
        store,
        virtualUsers,
        virtualUserId: 'susan',
        enabled: true,
        ...production,
      }),
      (e) =>
        getErrorResponse(e)?.status === 403 &&
        /Virtual users do not run against production/.test((e as Error).message)
    )
    assert.equal(writes.length, 0)
  })

  // Fields left out keep what the row had, so the disposition checked is the
  // one it will hold after the write.
  test('refuses enabling a row saved earlier in production', async () => {
    const { store, writes } = scheduleStore({ ...schedule(), enabled: false })
    await assert.rejects(
      writeVirtualUserSchedule({
        store,
        virtualUsers,
        virtualUserId: 'susan',
        enabled: true,
        ...production,
      }),
      /Virtual users do not run against production/
    )
    assert.equal(writes.length, 0)
  })

  test('refuses editing a row that is already enabled in production', async () => {
    const { store, writes } = scheduleStore(schedule())
    await assert.rejects(
      writeVirtualUserSchedule({
        store,
        virtualUsers,
        virtualUserId: 'susan',
        disposition: 'careless',
        ...production,
      }),
      /Virtual users do not run against production/
    )
    assert.equal(writes.length, 0)
  })

  test('an accountable cadence is refused in production too', async () => {
    const { store, writes } = scheduleStore()
    await assert.rejects(
      writeVirtualUserSchedule({
        store,
        virtualUsers,
        virtualUserId: 'susan',
        enabled: true,
        disposition: 'accountable',
        ...production,
      }),
      /Virtual users do not run against production/
    )
    assert.equal(writes.length, 0)
  })

  // A new row takes the virtual user's declared disposition, so the one checked is
  // the one every tick will run with.
  test('a new cadence is written with the disposition that was checked', async () => {
    const { store, writes } = scheduleStore()
    await writeVirtualUserSchedule({
      store,
      virtualUsers: {
        susan: { ...virtualUsers.susan, disposition: 'accountable' },
      } as unknown as ScaffoldVirtualUsers,
      virtualUserId: 'susan',
      enabled: true,
    })
    assert.equal(writes[0].disposition, 'accountable')
  })

  // Turning one off, or editing one that is off, is never a run, so it is never
  // refused — or a probing cadence left over in production could not be stopped.
  test('disabling or editing an off cadence is allowed in production', async () => {
    const { store, writes } = scheduleStore(schedule())
    await writeVirtualUserSchedule({
      store,
      virtualUsers,
      virtualUserId: 'susan',
      enabled: false,
      ...production,
    })
    const off = scheduleStore({ ...schedule(), enabled: false })
    await writeVirtualUserSchedule({
      store: off.store,
      virtualUsers,
      virtualUserId: 'susan',
      disposition: 'careless',
      ...production,
    })
    assert.equal(writes.length, 1)
    assert.equal(off.writes.length, 1)
  })

  test('outside production any enabled disposition is written', async () => {
    const { store, writes } = scheduleStore()
    await writeVirtualUserSchedule({
      store,
      virtualUsers,
      virtualUserId: 'susan',
      enabled: true,
      disposition: 'adversarial',
      environments: { staging: {}, production: { production: true } },
      environment: 'staging',
    })
    assert.equal(writes.length, 1)
  })

  test('durationMs is written as the budget duration the engine reads', async () => {
    const { store, writes } = scheduleStore()
    await writeVirtualUserSchedule({
      store,
      virtualUsers,
      virtualUserId: 'susan',
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
    await writeVirtualUserSchedule({
      store,
      virtualUsers,
      virtualUserId: 'susan',
    })
    assert.equal(writes[0].budget, undefined)
    await writeVirtualUserSchedule({
      store,
      virtualUsers,
      virtualUserId: 'susan',
      budget: null,
    })
    assert.equal(writes[1].budget, null)
  })

  test('a next run time crosses as a string and is stored as a date', async () => {
    const { store, writes } = scheduleStore()
    await writeVirtualUserSchedule({
      store,
      virtualUsers,
      virtualUserId: 'susan',
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
      virtualUserId: 'susan',
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
  // that a virtual user is still out there working.
  test('everything a tick did is written down, since nobody is watching', () => {
    const { logger, lines } = silentLogger()
    logVirtualUserTick(logger, {
      dispatched: [{ virtualUserId: 'susan', runId: 'run-9' }],
      reaped: ['run-8'],
      skipped: [{ virtualUserId: 'observed', reason: 'not due' }],
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
        virtualUsers,
        createVirtualUsers: () => ({}) as any,
        auth: { api: {} },
        runId: 'run-1',
        virtualUserId: 'susan',
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

  test('says what the address is for and what to put there', async () => {
    const { params: p } = params()
    await assert.rejects(
      executeVirtualUserRun(p),
      /VIRTUAL_USER_API_URL is not set.*URL this app is reached at/
    )
  })

  test('an app with no auth service says so rather than failing later', async () => {
    const { params: p } = params({
      auth: undefined,
      variables: variables({ VIRTUAL_USER_API_URL: 'http://localhost:4000' }),
    })
    await assert.rejects(
      executeVirtualUserRun(p),
      /no auth service.*pikkuVirtualUser plugin/
    )
  })

  test('a model to think with is not assumed either', async () => {
    const { params: p } = params({
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
      }),
    })
    await assert.rejects(
      executeVirtualUserRun(p),
      /VIRTUAL_USER_MODEL is not set/
    )
  })

  test("signs in through the app's own auth, with no credential read", async () => {
    const read: string[] = []
    const calls: any[] = []
    const env: Record<string, string> = {
      VIRTUAL_USER_API_URL: 'http://localhost:4000',
      VIRTUAL_USER_MODEL: 'a-model',
    }
    let built: any
    const { params: p } = params({
      auth: {
        api: {
          signInVirtualUserInternal: async (input: any) => {
            calls.push(input.body.email)
            return new Response('{}', {
              headers: { 'set-cookie': 'session=in-process; Path=/' },
            })
          },
        },
      },
      variables: {
        get: async (name: string) => (read.push(name), env[name]),
      },
      createVirtualUsers: (given: any) => {
        built = createHttpVirtualUsers({ ...given, virtualUsers })
        return {}
      },
    })
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('{}')) as typeof fetch
    try {
      await assert.rejects(executeVirtualUserRun(p), /cannot sign in/)
      await built.susan.invokeRaw('ping', {})
    } finally {
      globalThis.fetch = realFetch
    }
    assert.deepEqual(calls, [virtualUsers.susan.email])
    assert.deepEqual(
      read.filter((name) => /SECRET|TOKEN|KEY/.test(name)),
      []
    )
  })

  test('a virtual user nobody declares any more is refused before signing in', async () => {
    let called = false
    const { params: p } = params({
      virtualUserId: 'gone',
      variables: variables({
        VIRTUAL_USER_API_URL: 'http://localhost:4000',
        VIRTUAL_USER_MODEL: 'a-model',
      }),
      createVirtualUsers: () => {
        called = true
        return {}
      },
    })
    await assert.rejects(
      executeVirtualUserRun(p),
      /VirtualUser "gone" is no longer declared/
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
        VIRTUAL_USER_MODEL: 'a-model',
      }),
      createVirtualUsers: () => ({
        susan: {
          name: 'susan',
          email: 'susan@virtualuser.local',
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
