import { defineContributors } from '@pikku/core/contributors'
import { natsDeploy } from './nats-contributor.js'

export const contributors = defineContributors({
  nats: { deploy: natsDeploy },
})
