import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import {
  applyPikkuSchemas,
  KyselyVirtualUserRunStore,
  KyselyVirtualUserScheduleStore,
  SerializePlugin,
  virtualUserSchema,
  virtualUserScheduleSchema,
} from '@pikku/kysely'

import '../../.pikku/pikku-bootstrap.gen.js'
import { createSingletonServices } from '../services.js'
import { createConfig } from '../config.js'

export const HOUR = 60 * 60 * 1000

/**
 * A real project, real stores on a real (in-memory) SQLite, and the scheduler
 * wiring a project writes. The only fake is the queue, because what is being
 * checked ends where a run is handed to the queue: that a due virtual user becomes a
 * recorded run, once, and that nothing slips past the production refusal or the
 * scope gate on the way.
 */
export const boot = async (
  nodeEnv: string,
  extra: Record<string, unknown> = {}
) => {
  const db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await applyPikkuSchemas(db, [virtualUserSchema, virtualUserScheduleSchema])
  const virtualUserRunStore = new KyselyVirtualUserRunStore(db)
  const virtualUserScheduleStore = new KyselyVirtualUserScheduleStore(db)
  await virtualUserRunStore.init()
  await virtualUserScheduleStore.init()

  const queued: { queue: string; job: any; options: any }[] = []
  const queueService = {
    add: async (queue: string, job: unknown, options: unknown) => {
      queued.push({ queue, job, options })
      return `job-${queued.length}`
    },
  } as any

  await createSingletonServices(
    { ...(await createConfig()), nodeEnv } as any,
    {
      virtualUserRunStore,
      virtualUserScheduleStore,
      queueService,
      ...extra,
    } as any
  )
  return { virtualUserRunStore, virtualUserScheduleStore, queued }
}
