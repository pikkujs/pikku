import { defineProvider } from '@pikku/core/provider'
import { MARKER as PG } from '@verifier/fake-pg'
import { MARKER as SQLITE } from '@verifier/fake-sqlite'

export const kysely = defineProvider({
  dev: () => ({ kysely: { driver: SQLITE } }),
  'deploy:cloudflare-worker': () => ({ kysely: { driver: SQLITE } }),
  'deploy:cloudflare-container': () => ({ kysely: { driver: PG } }),
})
