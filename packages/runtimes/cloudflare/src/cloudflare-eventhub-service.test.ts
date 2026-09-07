import { defineEventHubServiceTests } from '@pikku/core/testing'
import { CloudflareEventHubService } from './cloudflare-eventhub-service.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as never

const durableObjectState = {
  blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
  storage: {
    get: async () => undefined,
    put: async () => {},
  },
  getWebSockets: () => [],
} as never

defineEventHubServiceTests(
  'CloudflareEventHubService',
  () => new CloudflareEventHubService(logger, durableObjectState),
  { expectsHandlerSupport: false }
)
