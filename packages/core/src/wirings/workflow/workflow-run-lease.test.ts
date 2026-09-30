import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { InMemoryLeaseService } from '../../services/in-memory-lease-service.js'
import {
  LeaseLostError,
  type Lease,
  type LeaseService,
} from '../../services/lease-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { RUN_LEASE_RETRY_MS } from './workflow-constants.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'

type Queued = { queue: string; data: unknown; delay?: number }

const logs = () => {
  const warnings: string[] = []
  return {
    warnings,
    logger: {
      error() {},
      info() {},
      debug() {},
      warn(message: string) {
        warnings.push(message)
      },
    },
  }
}

/** A lease service whose every renewal is refused: the lease was lost mid-body. */
class LosingLeaseService extends InMemoryLeaseService {
  override async refresh(): Promise<Lease | null> {
    return null
  }
}

/**
 * In-memory storage behind the base run and step locks, which is what a
 * persistent store inherits. `InMemoryWorkflowService` itself passes both
 * through, since it is single-process by design.
 */
class LeasedWorkflowService extends InMemoryWorkflowService {
  protected override readonly leaseService: LeaseService | undefined

  constructor(leaseService: LeaseService | undefined) {
    super()
    this.leaseService = leaseService
  }

  override withRunLease<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return PikkuWorkflowService.prototype.withRunLease.call(this, id, fn)
  }

  override withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return PikkuWorkflowService.prototype.withStepLock.call(
      this,
      runId,
      stepName,
      fn
    )
  }

  claim(runId: string, stepName: string) {
    return PikkuWorkflowService.prototype['claimStepForExecution'].call(
      this,
      runId,
      stepName,
      'flow',
      60_000
    )
  }
}

const registerFlow = (
  source: 'dsl' | 'graph',
  body: () => Promise<unknown>
) => {
  pikkuState(null, 'workflows', 'meta', {
    flow: {
      name: 'flow',
      pikkuFuncId: 'flow',
      source,
      graphHash: 'flow-hash',
      nodes: source === 'graph' ? {} : undefined,
    },
  } as any)
  pikkuState(null, 'workflows', 'registrations').set('flow', {
    name: 'flow',
    func: body,
  } as any)
  pikkuState(null, 'function', 'meta', {
    flow: {
      pikkuFuncId: 'flow',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    },
  } as any)
  pikkuState(null, 'function', 'functions').set('flow', { func: body } as any)
}

describe('the workflow run lease', () => {
  let queued: Queued[]
  const queueService = {
    add: async (queue: string, data: unknown, options?: { delay?: number }) => {
      queued.push({ queue, data, delay: options?.delay })
      return 'job'
    },
  }

  beforeEach(() => {
    resetPikkuState()
    queued = []
  })

  test('an inline run that completed under a lost lease stays completed', async () => {
    const { logger } = logs()
    pikkuState(null, 'package', 'singletonServices', { logger } as any)
    registerFlow('dsl', async () => 'done')
    const service = new LeasedWorkflowService(new LosingLeaseService())
    let runId: string | undefined

    await assert.rejects(
      service.startWorkflow('flow', {}, { type: 'test' } as any, {} as any, {
        inline: true,
        onRunCreated: (id) => (runId = id),
      }),
      LeaseLostError
    )

    const run = await service.getRun(runId!)
    assert.equal(
      run?.status,
      'completed',
      'the lost lease overwrote the outcome the body had already written'
    )
  })

  test('a message for a held run wakes it again later instead of spending a retry', async () => {
    const { logger } = logs()
    const leases = new InMemoryLeaseService()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      queueService,
    } as any)
    let entered = false
    registerFlow('dsl', async () => {
      entered = true
    })
    const service = new LeasedWorkflowService(leases)
    const runId = await service.createRun('flow', {}, false, 'flow-hash', {
      type: 'test',
    })
    await leases.acquire(`workflow-run:${runId}`, 'another-worker', 60_000)

    await service.orchestrateWorkflow(runId, {} as any)

    assert.equal(entered, false, 'the body ran without the run lease')
    assert.deepEqual(queued, [
      {
        queue: service.getOrchestratorQueueName('flow'),
        data: { runId },
        delay: RUN_LEASE_RETRY_MS,
      },
    ])
    assert.equal((await service.getRun(runId))?.status, 'running')
  })

  test('a graph run is orchestrated under the run lease', async () => {
    const { logger } = logs()
    const leases = new InMemoryLeaseService()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      queueService,
    } as any)
    registerFlow('graph', async () => {})
    const service = new LeasedWorkflowService(leases)
    const runId = await service.createRun('flow', {}, false, 'flow-hash', {
      type: 'test',
    })
    await leases.acquire(`workflow-run:${runId}`, 'another-worker', 60_000)

    await service.orchestrateWorkflow(runId, {} as any)

    assert.equal(
      (await service.getRun(runId))?.status,
      'running',
      'a second pass planned the graph while another held its run'
    )
    assert.equal(queued.length, 1)
    assert.equal(queued[0]!.delay, RUN_LEASE_RETRY_MS)
  })

  test('a service built without a lease service refuses to orchestrate', async () => {
    const { logger } = logs()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      queueService,
    } as any)
    let entered = false
    registerFlow('dsl', async () => {
      entered = true
    })
    const service = new LeasedWorkflowService(undefined)
    const runId = await service.createRun('flow', {}, false, 'flow-hash', {
      type: 'test',
    })

    await assert.rejects(
      service.orchestrateWorkflow(runId, {} as any),
      /without a leaseService/
    )
    assert.equal(
      entered,
      false,
      'the body ran with nothing excluding a second pass'
    )
  })
})

describe('the workflow step lock', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', logs() as any)
  })

  const pendingStep = async (service: LeasedWorkflowService) => {
    const runId = await service.createRun('flow', {}, false, 'flow-hash', {
      type: 'test',
    })
    await service.insertStepState(runId, 'charge', 'flow', {})
    return runId
  }

  test('a step claimed elsewhere is left to its claimant', async () => {
    const leases = new InMemoryLeaseService()
    const service = new LeasedWorkflowService(leases)
    const runId = await pendingStep(service)
    await leases.acquire(
      `workflow-step:${runId}:charge`,
      'another-worker',
      60_000
    )

    assert.equal(await service.claim(runId, 'charge'), null)
    assert.equal(
      (await service.getStepState(runId, 'charge')).status,
      'pending',
      'the step was claimed while another dispatch held it'
    )
  })

  test('a free step is claimed and its lease released', async () => {
    const leases = new InMemoryLeaseService()
    const service = new LeasedWorkflowService(leases)
    const runId = await pendingStep(service)

    const claimed = await service.claim(runId, 'charge')

    assert.equal(claimed?.status, 'running')
    assert.equal(await leases.get(`workflow-step:${runId}:charge`), null)
  })
})
