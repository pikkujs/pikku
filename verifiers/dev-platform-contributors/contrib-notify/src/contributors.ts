import { defineContributors } from '@pikku/core/contributors'
import { blobDeploy, blobDev } from './blob.js'
import { cacheDeploy, cacheDev } from './cache.js'
import { loggerPrefixDeploy, loggerPrefixDev } from './logger-prefix.js'
import { notifierDeploy, notifierDev } from './notifier.js'
import { notifierAuditDeploy, notifierAuditDev } from './notifier-audit.js'
import { unusedDev } from './unused.js'

// `notifier-audit` is registered before `notifier` on purpose: it needs what
// `notifier` provides, so the order the generator writes is not the order here.
export const contributors = defineContributors({
  'notifier-audit': { dev: notifierAuditDev, deploy: notifierAuditDeploy },
  notifier: { dev: notifierDev, deploy: notifierDeploy },
  'logger-prefix': { dev: loggerPrefixDev, deploy: loggerPrefixDeploy },
  blob: { dev: blobDev, deploy: blobDeploy },
  cache: { dev: cacheDev, deploy: cacheDeploy },
  unused: { dev: unusedDev },
})
