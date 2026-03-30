/**
 * Cloudflare D1-backed services.
 *
 * Uses kysely-d1 dialect to run existing Kysely SQL against D1's SQLite.
 */

import { Kysely } from 'kysely'
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
 */
export function createD1Kysely(d1Database: D1Database): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new D1Dialect({ database: d1Database }),
  })
}

/**
 * Workflow service backed by Cloudflare D1.
 * Auto-creates tables on first init().
 */
export class CloudflareWorkflowService extends KyselyWorkflowService {
  constructor(d1Database: D1Database) {
    super(createD1Kysely(d1Database))
  }
}

/**
 * AI storage service (threads, messages, tool calls) backed by Cloudflare D1.
 * Auto-creates tables on first init().
 */
export class CloudflareAIStorageService extends KyselyAIStorageService {
  constructor(d1Database: D1Database) {
    super(createD1Kysely(d1Database))
  }
}

/**
 * Agent run service (run listing, status tracking) backed by Cloudflare D1.
 * Auto-creates tables on first init().
 */
export class CloudflareAgentRunService extends KyselyAgentRunService {
  constructor(d1Database: D1Database) {
    super(createD1Kysely(d1Database))
  }
}

/**
 * AI run state service (run lifecycle, approvals) backed by Cloudflare D1.
 * Auto-creates tables on first init().
 */
export class CloudflareAIRunStateService extends KyselyAIRunStateService {
  constructor(d1Database: D1Database) {
    super(createD1Kysely(d1Database))
  }
}
