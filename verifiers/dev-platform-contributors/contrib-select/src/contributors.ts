import { defineContributors } from '@pikku/core/contributors'
import { edgeQueueDeploy, kyselyFakeDeploy } from './edge.js'
import { queueNoopDeploy, queueNoopDev } from './queue-noop.js'
import { queueRealDeploy, queueRealDev } from './queue-real.js'
import { storePostgresDeploy, storePostgresDev } from './store-postgres.js'
import { storeSqliteDeploy, storeSqliteDev } from './store-sqlite.js'

// Each pair provides the same key under exclusive `when`s: the clash check must
// run after `when`, or neither pair could ever build.
export const contributors = defineContributors({
  'store-postgres': { dev: storePostgresDev, deploy: storePostgresDeploy },
  'store-sqlite': { dev: storeSqliteDev, deploy: storeSqliteDeploy },
  'queue-real': { dev: queueRealDev, deploy: queueRealDeploy },
  'queue-noop': { dev: queueNoopDev, deploy: queueNoopDeploy },
  // Deploy-only, opted in by the checks that drive a real adapter.
  'edge-queue': { deploy: edgeQueueDeploy },
  'kysely-fake': { deploy: kyselyFakeDeploy },
})
