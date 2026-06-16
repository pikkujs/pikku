/**
 * Cloudflare-named Kysely-backed services.
 *
 * These wrappers no longer assume D1 — they take a pre-built
 * `Kysely<KyselyPikkuDB>` so the caller picks the dialect (D1, libsql,
 * Postgres, …). `createD1Kysely` is still exported as a convenience for
 * users who want the D1-backed instance.
 */

import { CamelCasePlugin, Kysely } from 'kysely'
import { SerializePlugin } from '@pikku/kysely'
import { D1Dialect } from 'kysely-d1'
import type { D1Database } from '@cloudflare/workers-types'
import type { KyselyPikkuDB } from '@pikku/kysely'
import {
  KyselyWorkflowService,
  KyselyAIStorageService,
  KyselyAgentRunService,
  KyselyAIRunStateService,
} from '@pikku/kysely'

/**
 * Creates a Kysely instance backed by a Cloudflare D1 binding.
 * Convenience for callers that want a D1-backed kysely — services below
 * accept any `Kysely<KyselyPikkuDB>`, so libsql/Postgres works too.
 */
export function createD1Kysely(d1Database: D1Database): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new D1Dialect({ database: d1Database }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
}

/**
 * Workflow service backed by a Kysely instance.
 * Auto-creates tables on first init().
 */
export class CloudflareWorkflowService extends KyselyWorkflowService {
  constructor(kysely: Kysely<KyselyPikkuDB>) {
    super(kysely)
  }
}

/**
 * AI storage service (threads, messages, tool calls).
 * Auto-creates tables on first init().
 */
export class CloudflareAIStorageService extends KyselyAIStorageService {
  constructor(kysely: Kysely<KyselyPikkuDB>) {
    super(kysely)
  }
}

/**
 * Agent run service (run listing, status tracking).
 * Auto-creates tables on first init().
 */
export class CloudflareAgentRunService extends KyselyAgentRunService {
  constructor(kysely: Kysely<KyselyPikkuDB>) {
    super(kysely)
  }
}

/**
 * AI run state service (run lifecycle, approvals).
 * Auto-creates tables on first init().
 */
export class CloudflareAIRunStateService extends KyselyAIRunStateService {
  constructor(kysely: Kysely<KyselyPikkuDB>) {
    super(kysely)
  }
}
