import { defineProvider } from '@pikku/core/provider'
import { containerKysely } from './kysely-container.js'
import { workerKysely } from './kysely-worker.js'

export const kysely = defineProvider({
  'deploy:cloudflare-worker': workerKysely,
  'deploy:cloudflare-container': containerKysely,
})
