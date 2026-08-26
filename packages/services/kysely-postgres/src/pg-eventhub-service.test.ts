import { defineEventHubServiceTests } from '@pikku/core/testing'
import { PgEventHubService } from './pg-eventhub-service.js'

defineEventHubServiceTests(
  'PgEventHubService',
  () => new PgEventHubService('postgres://unused')
)
