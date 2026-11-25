import { defineProvider } from '@pikku/core/provider'
import { MARKER } from '@verifier/fake-pg'

export const kysely = defineProvider({
  dev: () => ({ kysely: { driver: MARKER } }),
  'deploy:cloudflare-worker': () => ({ kysely: { driver: MARKER } }),
  'deploy:cloudflare-container': () => ({ kysely: { driver: MARKER } }),
})
