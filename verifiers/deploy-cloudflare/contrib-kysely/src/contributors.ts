import { defineContributors } from '@pikku/core/contributors'
import { kyselyStandIn } from './kysely-stand-in.js'

export const contributors = defineContributors({
  'kysely-stand-in': { deploy: kyselyStandIn },
})
