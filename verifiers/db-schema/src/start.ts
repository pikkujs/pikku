/**
 * What the migrated database is worth at runtime.
 *
 * Two claims, both of which only mean anything after `pikku db migrate` has run
 * against a real file:
 *
 *   1. The addon reads and writes the table the consumer migrated on its behalf.
 *      The addon shipped `labels`, never created it, and finds it there.
 *   2. `ensurePikkuSchema` reports `present` and issues no DDL. Creating at boot
 *      is the fallback now, not the intent — once the migration exists, the
 *      runtime stops being an author of the schema.
 */
import { runPikkuFunc } from '@pikku/core/function'
import { ensurePikkuSchema, pikkuSchemas } from '@pikku/kysely'
import { createConfig } from './config.js'
import { createSingletonServices, createWireServices } from './services.js'

const check = (ok: boolean, message: string): boolean => {
  console.log(`${ok ? '✓' : '✗'} ${message}`)
  return ok
}

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

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

  for (const schema of pikkuSchemas) {
    const outcome = await ensurePikkuSchema(singletonServices.kysely, schema)
    passed =
      check(
        outcome === 'present',
        `boot found '${schema.name}' already migrated and issued no DDL (${outcome})`
      ) && passed
  }

  await singletonServices.kysely.destroy()
  if (!passed) process.exit(1)
}

main().catch((error) => {
  console.error('✗ runtime checks failed:', error?.message ?? error)
  console.error(error?.stack)
  process.exit(1)
})
