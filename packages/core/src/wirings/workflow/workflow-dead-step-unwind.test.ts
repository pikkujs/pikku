import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { getSingletonServices } from '../../pikku-state.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import {
  afterRenewal,
  fastLeaseRenewals,
  gate,
  LeasedWorkflowService,
} from './workflow-lease-helpers.test.js'
import type { StepStatus, WorkflowStatus } from './workflow.types.js'

const LIMIT = { timeout: 20_000 }

let restoreTimers: () => void
before(() => {
  restoreTimers = fastLeaseRenewals()
})
after(() => restoreTimers())

let ws: InMemoryWorkflowService
let h: QueuedWorkflowHarness
let warnings: string[]
let compensated: Array<{ step: string; ok: boolean; error?: string }>

const useService = <T extends InMemoryWorkflowService>(service: T): T => {
  ws = service
  h = new QueuedWorkflowHarness(service)
  warnings = []
  getSingletonServices().logger.warn = ((message: unknown) => {
    warnings.push(String(message))
  }) as never
  return service
}

beforeEach(() => {
  compensated = []
  useService(new InMemoryWorkflowService())
})

const withoutQueue = () => {
  delete (getSingletonServices() as { queueService?: unknown }).queueService
}

const undo = async (_data: unknown, context: any) => {
  compensated.push({
    step: context.stepName,
    ok: context.ok,
    error: context.error?.message,
  })
}

const register = (
  name: string,
  forward: (data: any, wire: any) => Promise<unknown> = async () => ({}),
  options: { compensate?: boolean; queued?: boolean } = {}
) =>
  h.register(name, {
    forward,
    queued: options.queued ?? true,
    ...((options.compensate ?? true) ? { compensate: undo } : {}),
  })

const boom = async () => {
  throw new Error('boom')
}

const status = async (runId: string) => (await ws.getRun(runId))!.status

const rows = async (runId: string) => {
  const latest = new Map<string, string>()
  for (const step of await ws.getRunSteps(runId)) {
    latest.set(
      step.stepName,
      `${step.stepName}:${step.attemptCount}:${step.status}`
    )
  }
  return [...latest.values()]
}

const runJob = async (job: (typeof h.queue)[number]) => {
  if (job.data.stepName === undefined) {
    await ws.orchestrateWorkflow(job.data.runId, h.rpc as never)
    return
  }
  await ws
    .executeWorkflowStep(
      job.data.runId,
      job.data.stepName,
      job.data.rpcName,
      job.data.data,
      h.rpc as never
    )
    .catch(() => {})
}

/** Run queued jobs, leaving the jobs of the `held` steps for the test. */
const pumpExcept = async (...held: string[]) => {
  const kept: typeof h.queue = []
  while (h.queue.length > 0) {
    const job = h.queue.shift()!
    if (held.includes(job.data.stepName)) kept.push(job)
    else await runJob(job)
  }
  return kept
}

/** A graph run: `entry`, then every one of `branches` beside each other. */
const fanOut = (
  entry: string,
  branches: string[],
  nodes: Record<string, object> = {}
) =>
  h.defineGraph('flow', entry, {
    ...nodes,
    [entry]: { next: branches },
    ...Object.fromEntries(branches.map((name) => [name, { ...nodes[name] }])),
  })

/** Fail `sib` while the worker of `stepName` has claimed its step. */
const failBeside = async (stepName: string, entered: Promise<void>) => {
  const jobs = await pumpExcept(stepName, 'sib')
  const job = (name: string) => jobs.find((j) => j.data.stepName === name)!
  const worker = runJob(job(stepName))
  await entered
  await runJob(job('sib'))
  await pumpExcept()
  return { worker, job: job(stepName) }
}

const start = async (name = 'flow') =>
  (await ws.startWorkflow(name, {}, { type: 'test' }, h.rpc as never)).runId

/**
 * A queued run of `zero`, then `slow` beside a sibling that fails. `slow` is
 * claimed and running when this resolves, and the sibling has failed.
 */
const slowBesideFailure = async (options: { compensate?: boolean } = {}) => {
  const entered = gate()
  const release = gate()
  register('zero')
  register(
    'slow',
    async () => {
      entered.open()
      await release.passed
      return {}
    },
    options
  )
  register('sib', boom, { compensate: false })
  fanOut('zero', ['sib', 'slow'])
  const runId = await start()
  const { worker } = await failBeside('slow', entered.passed)
  return {
    runId,
    finish: async () => {
      release.open()
      await worker
      await pumpExcept()
    },
  }
}

/** The step's worker vanished: its lease lapses and nothing renews it. */
const lapse = async (runId: string, stepName: string) => {
  const step = await ws.getStepState(runId, stepName)
  step.leaseExpiresAt = new Date(0)
}

const sweep = () => ws.recoverStalledRuns({ stalledAfterMs: -1_000 })

/**
 * Sweep, check that recovery drove the unwind itself and asked no orchestrator
 * to, then run what it dispatched.
 */
const sweepAndPump = async () => {
  await sweep()
  assert.deepEqual(
    h.queue.filter((job) => job.data.stepName === undefined),
    []
  )
  await pumpExcept()
}

describe('a failure unwind waits for every forward step', () => {
  for (const compensate of [true, false]) {
    test(
      `nothing is compensated while a sibling ${compensate ? 'with' : 'without'} a compensation runs`,
      LIMIT,
      async () => {
        const flow = await slowBesideFailure({ compensate })

        assert.equal(await status(flow.runId), 'compensating')
        assert.deepEqual(compensated, [])

        await flow.finish()

        assert.equal(await status(flow.runId), 'compensated')
        assert.deepEqual(
          compensated.map((c) => c.step),
          compensate ? ['slow', 'zero'] : ['zero']
        )
      }
    )
  }

  test(
    'a run with nothing to undo ends failed only once its sibling has',
    LIMIT,
    async () => {
      const entered = gate()
      const release = gate()
      register(
        'slow',
        async () => {
          entered.open()
          await release.passed
          return {}
        },
        { compensate: false }
      )
      register('sib', boom, { compensate: false })
      register('entry', async () => ({}), { compensate: false })
      fanOut('entry', ['sib', 'slow'])
      const runId = await start()
      const { worker } = await failBeside('slow', entered.passed)

      const during = await status(runId)
      release.open()
      await worker
      await pumpExcept()

      assert.equal(during, 'compensating')
      assert.equal(await status(runId), 'failed')
    }
  )

  test(
    'a step never started is refused at once and its late job does nothing',
    LIMIT,
    async () => {
      register('zero')
      register('later')
      register('sib', boom, { compensate: false })
      fanOut('zero', ['sib', 'later'])
      const runId = await start()
      const held = await pumpExcept('later')

      assert.equal(await status(runId), 'compensated')
      for (const job of held) await runJob(job)
      await pumpExcept()

      assert.ok(!h.log.includes('do:later'))
      assert.deepEqual(
        compensated.map((c) => c.step),
        ['zero']
      )
      assert.ok((await rows(runId)).includes('later:1:failed'))
    }
  )

  test(
    'a failed sibling with retries left gets no new attempt',
    LIMIT,
    async () => {
      register('flaky', async () => {
        throw new Error('flaky')
      })
      register('sib', boom, { compensate: false })
      register('entry', async () => ({}), { compensate: false })
      fanOut('entry', ['sib', 'flaky'], { flaky: { retries: 3 } })
      const runId = await start()
      const jobs = await pumpExcept('flaky', 'sib')
      const job = (name: string) => jobs.find((j) => j.data.stepName === name)!
      await runJob(job('flaky'))
      await runJob(job('sib'))
      await pumpExcept()
      // The queue redelivers the attempt that threw.
      await runJob(job('flaky'))
      await pumpExcept()

      assert.equal(await status(runId), 'compensated')
      assert.deepEqual(await rows(runId), [
        'entry:1:succeeded',
        'sib:1:failed',
        'flaky:1:failed',
        'flaky:compensate:1:succeeded',
      ])
    }
  )

  test(
    'a queued step that fails on a run going back is not handed back to the queue',
    LIMIT,
    async () => {
      const entered = gate()
      const release = gate()
      register('slow', async () => {
        entered.open()
        await release.passed
        throw new Error('late failure')
      })
      register('sib', boom, { compensate: false })
      register('entry', async () => ({}), { compensate: false })
      fanOut('entry', ['sib', 'slow'], { slow: { retries: 3 } })
      const runId = await start()
      const jobs = await pumpExcept('slow', 'sib')
      const job = (name: string) => jobs.find((j) => j.data.stepName === name)!
      const worker = ws.executeWorkflowStep(
        runId,
        'slow',
        'slow',
        job('slow').data.data,
        h.rpc as never
      )
      await entered.passed
      await runJob(job('sib'))
      await pumpExcept()
      release.open()

      await worker
      await pumpExcept()

      assert.equal(await status(runId), 'compensated')
      assert.deepEqual(compensated, [
        { step: 'slow', ok: false, error: 'late failure' },
      ])
    }
  )

  for (const gateKind of ['approval', 'suspend'] as const) {
    test(`an open ${gateKind} gate is refused at once`, LIMIT, async () => {
      register('zero')
      const runId = await ws.createRun('flow', {}, false, 'flow-hash', {
        type: 'test',
      })
      const zero = await ws.insertStepState(runId, 'Zero', 'zero', {})
      await ws.setStepRunning(zero.stepId)
      await ws.setStepResult(zero.stepId, {})
      const open = await ws.insertStepState(
        runId,
        'Gate',
        gateKind === 'approval'
          ? 'pikkuWorkflowApproval'
          : 'pikkuWorkflowSuspend',
        {}
      )
      await ws.setStepRunning(open.stepId)

      await ws.failOrUnwind(
        (await ws.getRun(runId))!,
        new Error('boom'),
        h.rpc as never
      )
      await pumpExcept()

      assert.equal(await status(runId), 'compensated')
      assert.ok((await rows(runId)).includes('Gate:1:failed'))
    })
  }
})

describe('a dead step does not hold an unwind', () => {
  for (const compensate of [true, false]) {
    test(
      `a queued step ${compensate ? 'with' : 'without'} a compensation whose lease lapsed is failed, not rerun`,
      LIMIT,
      async () => {
        const flow = await slowBesideFailure({ compensate })
        await lapse(flow.runId, 'slow')

        await sweepAndPump()

        assert.equal(await status(flow.runId), 'compensated')
        const slow = await ws.getStepState(flow.runId, 'slow')
        assert.equal(slow.status, 'failed')
        assert.equal(slow.attemptCount, 1)
        assert.match(slow.error!.message, /lease expired/)
        assert.equal(h.log.filter((l) => l === 'do:slow').length, 1)
        assert.deepEqual(
          compensated.map((c) => `${c.step}:${c.ok}`),
          compensate ? ['slow:false', 'zero:true'] : ['zero:true']
        )
      }
    )
  }

  test(
    'a cancel unwind does not stay compensating on a lapsed queued step',
    LIMIT,
    async () => {
      const entered = gate()
      register('slow', async () => {
        entered.open()
        await new Promise(() => {})
      })
      h.defineDsl('flow', async (w: any) => {
        await w.do('Slow', 'slow', {})
      })
      const runId = await start()
      const [slowJob] = await pumpExcept('Slow')
      void runJob(slowJob!)
      await entered.passed
      await ws.cancelRun(runId, h.rpc as never)
      assert.equal(await status(runId), 'compensating')
      await lapse(runId, 'Slow')

      await sweepAndPump()

      assert.equal(await status(runId), 'compensated')
      assert.deepEqual(
        compensated.map((c) => `${c.step}:${c.ok}`),
        ['Slow:false']
      )
    }
  )

  test(
    'a live queued step is never declared dead, and is named once in the log',
    LIMIT,
    async () => {
      const flow = await slowBesideFailure()
      warnings.length = 0

      for (let i = 0; i < 3; i++) {
        await ws.resumeWorkflow(flow.runId)
        await pumpExcept()
      }

      assert.equal(await status(flow.runId), 'compensating')
      assert.ok((await rows(flow.runId)).includes('slow:1:running'))
      const named = warnings.filter((w) => w.includes("'slow'"))
      assert.ok(named.length <= 1, named.join('\n'))
      await flow.finish()
      assert.equal(await status(flow.runId), 'compensated')
    }
  )

  test(
    'an unwind that waits on a live step warns, naming it',
    LIMIT,
    async () => {
      const flow = await slowBesideFailure()

      const named = warnings.filter((w) => w.includes("'slow'"))
      assert.equal(named.length, 1, warnings.join('\n'))
      assert.ok(named[0]!.includes(flow.runId))
      await flow.finish()
    }
  )

  /** A compensating run holding one `running` step that has no lease. */
  const passOwnedLeftBehind = async () => {
    register('work', async () => ({}), { queued: false })
    const runId = await ws.createRun('flow', {}, false, 'flow-hash', {
      type: 'test',
    })
    const step = await ws.insertStepState(runId, 'Work', 'work', {})
    await ws.setStepRunning(step.stepId)
    await ws.transitionRunStatus(
      runId,
      ['running'],
      'compensating',
      undefined,
      { message: 'boom' }
    )
    return runId
  }

  test(
    'a driver holding a real run lease declares a pass-owned step dead',
    LIMIT,
    async () => {
      useService(new LeasedWorkflowService())
      const runId = await passOwnedLeftBehind()
      withoutQueue()

      await sweep()

      assert.equal(await status(runId), 'compensated')
      assert.deepEqual(
        compensated.map((c) => `${c.step}:${c.ok}`),
        ['Work:false']
      )
    }
  )

  test(
    'a pass-owned step is left alone while another process holds the run',
    LIMIT,
    async () => {
      const leased = useService(new LeasedWorkflowService())
      const runId = await passOwnedLeftBehind()
      leased.leases.takenElsewhere.add(`workflow-run:${runId}`)
      withoutQueue()

      await sweep()

      assert.deepEqual(await rows(runId), ['Work:1:running'])
      assert.equal(await status(runId), 'compensating')
    }
  )

  test(
    'in memory, a pass-owned step nothing in the process is working is dead',
    LIMIT,
    async () => {
      const runId = await passOwnedLeftBehind()
      withoutQueue()

      await sweep()

      assert.equal(await status(runId), 'compensated')
    }
  )

  test(
    'in memory, a pass-owned step the process is working is never declared dead',
    LIMIT,
    async () => {
      const runId = await passOwnedLeftBehind()
      const release = gate()
      const held = ws.holdOpenStep(runId, 'Work', () => release.passed)

      assert.deepEqual((await sweep()).resumed, [])
      await ws.failOrUnwind(
        (await ws.getRun(runId))!,
        new Error('boom'),
        h.rpc as never
      )
      assert.deepEqual(await rows(runId), ['Work:1:running'])
      release.open()
      await held
    }
  )

  test(
    'a store that cannot see every step never declares a pass-owned one dead',
    LIMIT,
    async () => {
      class SharedPassThrough extends InMemoryWorkflowService {
        protected override readonly openStepsAreAllSteps = false
      }
      useService(new SharedPassThrough())
      const runId = await passOwnedLeftBehind()
      withoutQueue()

      await sweep()

      assert.deepEqual(await rows(runId), ['Work:1:running'])
      assert.equal(await status(runId), 'compensating')
    }
  )

  test(
    'a pass that lost its lease mid-step does not leave the run compensating',
    LIMIT,
    async () => {
      const leased = useService(new LeasedWorkflowService())
      let runId = ''
      register(
        'first',
        async (_data, wire) => {
          await ws.cancelRun(runId, h.rpc as never)
          leased.leases.loseToAnother(runId)
          await afterRenewal()
          throw wire.workflowStep.signal.reason
        },
        { queued: false }
      )
      h.defineDsl('flow', async (w: any) => {
        await w.do('First', 'first', {})
      })
      await assert.rejects(
        ws.startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
          inline: true,
          onRunCreated: (id) => {
            runId = id
          },
        })
      )
      assert.equal(await status(runId), 'compensating')
      leased.leases.takenElsewhere.clear()
      withoutQueue()

      await sweep()

      assert.equal(await status(runId), 'compensated')
      assert.deepEqual(
        compensated.map((c) => `${c.step}:${c.ok}`),
        ['First:false']
      )
    }
  )

  test(
    'a sweep during a live inline compensation does not return its run',
    LIMIT,
    async () => {
      const inUndo = gate()
      const release = gate()
      h.register('first', {
        queued: false,
        forward: async () => ({}),
        compensate: async () => {
          inUndo.open()
          await release.passed
        },
      })
      register('sib', boom, { queued: false, compensate: false })
      h.defineDsl('flow', async (w: any) => {
        await w.do('First', 'first', {})
        await w.do('Sib', 'sib', {}, { retries: 0 })
      })
      const pass = ws
        .startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
          inline: true,
        })
        .catch(() => {})
      await inUndo.passed

      const during = await sweep()
      release.open()
      await pass

      assert.deepEqual(during.resumed, [])
      assert.equal(h.undone.length, 1)
    }
  )
})

describe('what keeps a live step from being taken for a lost one', () => {
  test(
    'a retry claimed by a queued worker is never running without a lease',
    LIMIT,
    async () => {
      let calls = 0
      register('flaky', async () => {
        if (++calls === 1) throw new Error('flaky')
        return {}
      })
      h.defineDsl('flow', async (w: any) => {
        await w.do('Flaky', 'flaky', {}, { retries: 1 })
      })
      const unleased: string[] = []
      for (const write of ['createRetryAttempt', 'setStepRunning'] as const) {
        const original = (ws as any)[write].bind(ws)
        ;(ws as any)[write] = async (...args: unknown[]) => {
          const result = await original(...args)
          const step = await ws.getStepState(runId, 'Flaky')
          if (step.status === 'running' && step.leaseExpiresAt == null) {
            unleased.push(`${write}:${step.attemptCount}`)
          }
          return result
        }
      }
      const runId = await start()
      await h.pump()

      assert.equal(await status(runId), 'completed')
      assert.deepEqual(unleased, [])
    }
  )

  test(
    'a step a worker claims as the unwind refuses it is still compensated',
    LIMIT,
    async () => {
      register('work')
      const runId = await ws.createRun('flow', {}, false, 'flow-hash', {
        type: 'test',
      })
      const step = await ws.insertStepState(runId, 'Work', 'work', {})
      const claim = (ws as any).claimStepStatus.bind(ws)
      ;(ws as any).claimStepStatus = async (...args: unknown[]) => {
        // The worker gets there first.
        ;(ws as any).claimStepStatus = claim
        await ws.setStepRunning(step.stepId)
        await ws.refreshStepLease(step.stepId, 60_000)
        return false
      }

      await ws.failOrUnwind(
        (await ws.getRun(runId))!,
        new Error('boom'),
        h.rpc as never
      )
      await ws.setStepResult(step.stepId, {})
      await ws.resumeWorkflow(runId)
      await ws.runWorkflowJob(runId, h.rpc as never)
      await pumpExcept()

      assert.deepEqual(
        compensated.map((c) => c.step),
        ['Work']
      )
    }
  )
})

describe('a child step in an unwind', () => {
  /** A parent step linked to a child run, whose worker released its lease. */
  const parkedOnChild = async (childStatus: WorkflowStatus) => {
    register('zero')
    h.defineDsl('childFlow', async () => ({}))
    const childRunId = await ws.createRun(
      'childFlow',
      {},
      false,
      'childFlow-hash',
      { type: 'test' }
    )
    if (childStatus !== 'running') {
      await ws.transitionRunStatus(childRunId, ['running'], childStatus)
    }
    const runId = await ws.createRun('flow', {}, false, 'flow-hash', {
      type: 'test',
    })
    const zero = await ws.insertStepState(runId, 'Zero', 'zero', {})
    await ws.setStepRunning(zero.stepId)
    await ws.setStepResult(zero.stepId, {})
    const child = await ws.insertStepState(runId, 'Child', 'childFlow', {})
    await ws.setStepRunning(child.stepId)
    await ws.setStepChildRunId(child.stepId, childRunId)
    await ws.failOrUnwind(
      (await ws.getRun(runId))!,
      new Error('boom'),
      h.rpc as never
    )
    return { runId, childRunId }
  }

  test(
    'a step whose child is running is waited on, whatever sweeps it',
    LIMIT,
    async () => {
      const { runId } = await parkedOnChild('running')
      withoutQueue()

      await sweep()

      assert.equal(await status(runId), 'compensating')
      assert.ok((await rows(runId)).includes('Child:1:running'))
      assert.deepEqual(compensated, [])
    }
  )

  test(
    'a step whose child ended without telling it is given the outcome',
    LIMIT,
    async () => {
      const { runId, childRunId } = await parkedOnChild('running')
      await pumpExcept()
      await ws.transitionRunStatus(childRunId, ['running'], 'failed')

      await sweepAndPump()

      assert.equal(await status(runId), 'compensated')
    }
  )
})

describe('a child that ends its parent unwind early', () => {
  for (const ending of ['compensation_failed', 'compensated'] as const) {
    test(
      `a child ${ending} does not finish its parent while a sibling runs`,
      LIMIT,
      async () => {
        const entered = gate()
        const release = gate()
        register('slow', async () => {
          entered.open()
          await release.passed
          return {}
        })
        h.register('c1', {
          forward: async () => ({}),
          compensate: async () => {
            if (ending === 'compensation_failed') throw new Error('stuck')
          },
        })
        register('cboom', boom, { compensate: false })
        h.defineDsl('childFlow', async (w: any) => {
          if (ending === 'compensated') await w.milestone('Rest')
          await w.do('C1', 'c1', {}, { retries: 0 })
          await w.do('CBoom', 'cboom', {}, { retries: 0 })
        })
        register('entry', async () => ({}), { compensate: false })
        fanOut('entry', ['child', 'slow'], {
          child: { rpcName: 'childFlow' },
        })
        const runId = await start()
        const jobs = await pumpExcept('slow', 'child')
        const job = (name: string) =>
          jobs.find((j) => j.data.stepName === name)!
        const worker = runJob(job('slow'))
        await entered.passed
        await runJob(job('child'))
        await pumpExcept()

        const during = await status(runId)
        release.open()
        await worker
        await pumpExcept()

        assert.equal(during, 'compensating')
        assert.equal(await status(runId), ending)
      }
    )
  }
})

describe('the in-memory finder', () => {
  const compensatingWith = async (
    prepare: (stepId: string) => Promise<void>,
    stepName = 'Step'
  ) => {
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    const step = await ws.insertStepState(runId, stepName, 'work', {})
    await prepare(step.stepId)
    await ws.transitionRunStatus(runId, ['running'], 'compensating')
    return runId
  }

  const found = () =>
    (ws as any).findStalledRunIds(new Date(Date.now() + 1_000), 10)

  const move = async (stepId: string, to: StepStatus) => {
    if (to === 'scheduled') await ws.setStepScheduled(stepId)
    else await ws.setStepRunning(stepId)
  }

  test('returns a run whose step has no lease and no worker', async () => {
    const runId = await compensatingWith((id) => move(id, 'running'))
    assert.deepEqual(await found(), [runId])
  })

  test('returns a run whose forward step was only dispatched', async () => {
    const runId = await compensatingWith((id) => move(id, 'scheduled'))
    assert.deepEqual(await found(), [runId])
  })

  test('leaves a run whose compensation is dispatched', async () => {
    await compensatingWith((id) => move(id, 'scheduled'), 'Step:compensate')
    assert.deepEqual(await found(), [])
  })

  test('reads the latest attempt of a step only', async () => {
    const runId = await compensatingWith(async (id) => {
      await ws.setStepRunning(id)
      const next = await ws.createRetryAttempt(id, 'running')
      await ws.refreshStepLease(next.stepId, 60_000)
      await ws.setStepResult(next.stepId, {})
    })
    assert.deepEqual(await found(), [runId])
  })
})

describe('what the caller of an inline run is told', () => {
  test(
    'a run with nothing to undo that failed beside a sibling still rejects',
    LIMIT,
    async () => {
      register('sib', boom, { queued: false, compensate: false })
      h.defineDsl('flow', async (w: any) => {
        await Promise.all([
          w.do('Sib', 'sib', {}, { retries: 0 }),
          w.do('Slow', () => new Promise((resolve) => setTimeout(resolve, 20))),
        ])
      })
      let runId = ''

      await assert.rejects(
        ws.startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
          inline: true,
          onRunCreated: (id) => {
            runId = id
          },
        }),
        /boom/
      )

      assert.equal(await status(runId), 'failed')
    }
  )
})
