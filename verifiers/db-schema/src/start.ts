/**
 * What the migrated database is worth at runtime.
 *
 * Two claims, both of which only mean anything after `pikku db migrate` has run
 * against a real file:
 *
 *   1. The addon reads and writes the table the consumer migrated on its behalf.
 *      The addon shipped `labels`, never created it, and finds it there.
 *   2. The boot-time check finds exactly the runtime schemas this project's
 *      services own, refuses the ones it does not reach, and issues no DDL
 *      either way. The runtime is not an author of the schema: `pikku db
 *      generate` writes it and `pikku db migrate` applies it, so a schema the
 *      generator gated off is a sentence at startup rather than a table that
 *      quietly appeared.
 */
import type { Kysely } from 'kysely'
import { runPikkuFunc } from '@pikku/core/function'
import { requirePikkuSchema, pikkuSchemas } from '@pikku/kysely'
import { createConfig } from './config.js'
import { createSingletonServices, createWireServices } from './services.js'

/**
 * The schemas `pikku db generate` wrote for this project.
 *
 * `session`, `secret` and `deployment` are ungated. The rest are here because
 * `runtimeServices.functions.ts` reaches the services that own them — and every
 * other schema is absent for the same reason, which is the half of the contract
 * the rejections below cover.
 */
const MIGRATED = new Set([
  'session',
  'secret',
  'deployment',
  'workflow',
  'agent',
  'scope',
])

const check = (ok: boolean, message: string): boolean => {
  console.log(`${ok ? '✓' : '✗'} ${message}`)
  return ok
}

let db: Kysely<any>

/** What the database holds, so boot can be shown to have added nothing. */
const tableNames = async (): Promise<string[]> =>
  (await db.introspection.getTables()).map((table) => table.name).sort()

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)
  db = singletonServices.kysely

  const labels = await runPikkuFunc<
    { id: string; name: string },
    Array<{ id: string; name: string; color: string | null }>
  >('rpc', 'roundTripLabel', 'roundTripLabel', {
    singletonServices,
    createWireServices,
    data: () => ({ id: 'l1', name: 'urgent' }),
    wire: {},
  })

  let passed = check(
    labels.length === 1 && labels[0]?.name === 'urgent',
    `the addon wrote and read the migrated table (${JSON.stringify(labels)})`
  )

  const before = await tableNames()
  for (const schema of pikkuSchemas) {
    let error: string | undefined
    try {
      await requirePikkuSchema(singletonServices.kysely, schema)
    } catch (e: any) {
      error = e?.message ?? String(e)
    }

    passed = MIGRATED.has(schema.name)
      ? check(
          error === undefined,
          `boot found '${schema.name}' already migrated${error ? ` — ${error}` : ''}`
        ) && passed
      : check(
          error !== undefined &&
            /pikku db generate/.test(error) &&
            /is not in this database/.test(error),
          `boot refused '${schema.name}', which no service here reaches`
        ) && passed
  }
  passed =
    check(
      JSON.stringify(await tableNames()) === JSON.stringify(before),
      'boot issued no DDL of its own'
    ) && passed

  await singletonServices.kysely.destroy()
  if (!passed) process.exit(1)
}

main().catch((error) => {
  console.error('✗ runtime checks failed:', error?.message ?? error)
  console.error(error?.stack)
  process.exit(1)
})
