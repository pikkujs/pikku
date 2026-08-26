import { defineEventHubServiceTests } from '@pikku/core/testing'
import { PgEventHubService } from './pg-eventhub-service.js'

/**
 * No `init()`, so no Postgres connection and no NOTIFY backplane — this covers
 * the single-instance fan-out, which is the part that has to reach an SSE
 * stream. The cross-instance relay needs a real database and is covered by the
 * service tests that run against one.
 */
defineEventHubServiceTests(
  'PgEventHubService',
  () => new PgEventHubService('postgres://unused')
)
