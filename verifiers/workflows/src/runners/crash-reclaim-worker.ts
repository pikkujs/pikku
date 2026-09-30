/**
 * One workflow worker for the crash-reclaim runner, run as a process of its
 * own so the runner can SIGKILL it with a step still on it.
 *
 * pg-boss + PgKyselyWorkflowService + PgKyselyLeaseService, with every step
 * queue given a `lockDuration` of CRASH_STEP_LEASE_MS: the lease a claimed step
 * holds is read off that config, and the default minute would make each crash
 * a minute's wait. Prints `worker ready` once its queues are registered.
 */

import { pikkuState } from '@pikku/core/state'

import { createSingletonServices } from '../services.js'
import { createConfig, connectionString } from '../config.js'

import '../../.pikku/pikku-bootstrap.gen.js'

const SHARED_STEP_QUEUE = 'pikku-workflow-step-worker'

async function main(): Promise<void> {
  const leaseMs = Number(process.env.CRASH_STEP_LEASE_MS)
  if (!(leaseMs > 0)) {
    throw new Error('CRASH_STEP_LEASE_MS must be a positive number')
  }

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

  for (const [name, registration] of pikkuState(
    null,
    'queue',
    'registrations'
  )) {
    if (name.startsWith('wf-step-') || name === SHARED_STEP_QUEUE) {
      registration.config = { ...registration.config, lockDuration: leaseMs }
    }
  }

  await pgBossFactory.getQueueWorkers().registerQueues()
  console.log('worker ready')
}

main().catch((error) => {
  console.error('Crash-reclaim worker failed:', error)
  process.exit(1)
})
