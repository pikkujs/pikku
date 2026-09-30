/**
 * Run lease runner: a run whose lease another worker holds still finishes.
 *
 * The step of `runLeaseWorkflow` takes its own run's lease as a stranger and
 * keeps it for longer than pg-boss's whole retry budget for the orchestrator
 * message the step's completion enqueues (six attempts, the last ~55s in). If the
 * orchestrator treats a taken lease as a failure, that message is spent and the
 * run stays `running` forever. It must instead wake the run again later.
 *
 * Usage:
 *   yarn test:run-lease:pg   # pg-boss + PgKyselyWorkflowService + PgKyselyLeaseService
 */

import type { PikkuWorkflowService } from '@pikku/core/workflow'

import { createSingletonServices } from '../services.js'
import { createConfig, connectionString } from '../config.js'
import { allReleased } from './run-lease-holder.js'

import '../../.pikku/pikku-bootstrap.gen.js'

const HOLD_MS = 90_000
const TIMEOUT_MS = HOLD_MS + 45_000
const POLL_INTERVAL_MS = 250

async function setup(): Promise<{
  workflowService: PikkuWorkflowService
  registerQueues: () => Promise<unknown>
  cleanup: () => Promise<void>
}> {
  const config = await createConfig()
  const { PgKyselyWorkflowService, PgKyselyLeaseService } =
    await import('@pikku/kysely-postgres')
  const { PgBossServiceFactory } = await import('@pikku/queue-pg-boss')
  const { Kysely, CamelCasePlugin } = await import('kysely')
  const { PostgresJSDialect } = await import('kysely-postgres-js')
  const postgres = (await import('postgres')).default

  const pgBossFactory = new PgBossServiceFactory(connectionString)
  await pgBossFactory.init()
  const sql = postgres(connectionString)
  const db = new Kysely<any>({
    dialect: new PostgresJSDialect({ postgres: sql }),
    plugins: [new CamelCasePlugin()],
  })
  const workflowService = new PgKyselyWorkflowService(db)
  await workflowService.init()
  const leaseService = new PgKyselyLeaseService(db)
  await leaseService.init()

  await createSingletonServices(config, {
    queueService: pgBossFactory.getQueueService(),
    schedulerService: pgBossFactory.getSchedulerService(),
    workflowService,
    leaseService,
  })

  return {
    workflowService,
    registerQueues: () => pgBossFactory.getQueueWorkers().registerQueues(),
    cleanup: async () => {
      await workflowService.close()
      await pgBossFactory.close()
      await sql.end()
    },
  }
}

async function main(): Promise<void> {
  console.log('=== Run Lease Runner (pg) ===\n')
  const { workflowService, registerQueues, cleanup } = await setup()
  await registerQueues()

  const start = Date.now()
  const { runId } = await workflowService.startWorkflow(
    'runLeaseWorkflow',
    { holdMs: HOLD_MS },
    { type: 'test' },
    null as any
  )

  let status: string | undefined
  while (Date.now() - start < TIMEOUT_MS) {
    status = (await workflowService.getRun(runId))?.status
    if (status === 'completed' || status === 'failed') break
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  await allReleased()

  const elapsed = Date.now() - start
  const ok = status === 'completed' && elapsed >= HOLD_MS
  console.log(
    `${ok ? 'PASS' : 'FAIL'}: a run whose lease was held for ${HOLD_MS}ms by another worker ` +
      `ended ${status} after ${elapsed}ms`
  )

  await cleanup()
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error('Runner failed:', error)
  process.exit(1)
})
