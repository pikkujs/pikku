import { appendFileSync, existsSync, readFileSync, renameSync } from 'node:fs'
import type { Kysely, KyselyPlugin } from 'kysely'
import type { DB } from '#pikku/db/schema.gen.js'
import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
  type ScopeService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

/** Test only: each user's grants, read from a file the test rewrites. */
const grantsOf = async (userId: string): Promise<string[]> => {
  const grants = JSON.parse(readFileSync('grants.json', 'utf8'))
  return grants[userId] ?? []
}

const record = (event: unknown) =>
  appendFileSync('audit.jsonl', `${JSON.stringify(event)}\n`)

/**
 * Test only: when the test leaves a record's id in `interleave`, another
 * editor's write lands right after an update has read that record's version.
 */
const interleaved = (db: Kysely<DB>): KyselyPlugin => ({
  transformQuery: ({ node }) => node,
  transformResult: async ({ result }) => {
    if (existsSync('interleave') && 'storedVersion' in (result.rows[0] ?? {})) {
      const id = readFileSync('interleave', 'utf8')
      renameSync('interleave', 'interleaved')
      await db
        .updateTable('offering')
        .set({ title: 'Another editor', updatedAt: new Date().toISOString() })
        .where('id', '=', id)
        .execute()
    }
    return result
  },
})

/** Test only: every query that names a table of the fixture addon. */
const addonQueries: KyselyPlugin = {
  transformQuery: ({ node }) => {
    const query = JSON.stringify(node)
    if (/notes_?(note|reply)/i.test(query)) {
      appendFileSync('addon-queries.jsonl', `${query}\n`)
    }
    return node
  },
  transformResult: async ({ result }) => result,
}

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const logger = existingServices?.logger ?? new ConsoleLogger()
    const variables = existingServices?.variables ?? new LocalVariablesService()
    return {
      ...existingServices,
      config,
      logger,
      variables,
      // Test only: the audit trail, in a file the test reads.
      audit: { audit: async (event) => record(event) },
      schema: existingServices?.schema ?? new CFWorkerSchemaService(logger),
      secrets: existingServices?.secrets ?? new LocalSecretService(variables),
      kysely: (existingServices!.kysely! as Kysely<DB>)
        .withPlugin(interleaved(existingServices!.kysely! as Kysely<DB>))
        .withPlugin(addonQueries),
      content: existingServices!.content!,
      scopeService: { resolveScopes: grantsOf } as unknown as ScopeService,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => ({}) as any)
