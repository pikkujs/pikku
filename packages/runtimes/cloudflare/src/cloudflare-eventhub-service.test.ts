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

/**
 * Cloudflare delivers to Durable Object WebSockets only, so the suite asserts
 * the REFUSAL rather than delivery: an SSE stream lives in the Worker, not in
 * the DO, and accepting a handler it can never reach would only make the
 * failure quiet.
 */
defineEventHubServiceTests(
  'CloudflareEventHubService',
  () => new CloudflareEventHubService(logger, durableObjectState),
  { expectsHandlerSupport: false }
)
