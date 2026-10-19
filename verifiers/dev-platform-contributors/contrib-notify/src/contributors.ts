import { defineContributors } from '@pikku/core/contributors'
import { blobDeploy, blobDev } from './blob.js'
import { cacheDeploy, cacheDev } from './cache.js'
import { hookA } from './hook-a.js'
import { hookB } from './hook-b.js'
import { hookC } from './hook-c.js'
import { hookStopOnly } from './hook-stop-only.js'
import { loggerPrefixDeploy, loggerPrefixDev } from './logger-prefix.js'
import { notifierDeploy, notifierDev } from './notifier.js'
import { notifierAuditDeploy, notifierAuditDev } from './notifier-audit.js'
import { unitTagDeploy } from './unit-tag.js'
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
  'unit-tag': { deploy: unitTagDeploy },
  // Registered out of order on purpose: the hooks follow `needs`, not this list.
  'hook-c': { dev: hookC, deploy: hookC },
  'hook-b': { dev: hookB, deploy: hookB },
  'hook-a': { dev: hookA, deploy: hookA },
  'hook-stop-only': { deploy: hookStopOnly },
})
