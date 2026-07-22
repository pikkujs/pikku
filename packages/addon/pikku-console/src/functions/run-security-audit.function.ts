import { dirname } from 'node:path'
import { pikkuFunc } from '#pikku'
import type { SecurityAuditReport } from '@pikku/core'
import { readAuditReport, runPikkuAudit } from '../lib/audit-exec.js'

export const runSecurityAudit = pikkuFunc<null, SecurityAuditReport | null>({
  title: 'Run Security Audit',
  description:
    'Runs `pikku audit --outdated`, regenerating .pikku/audit.json, and returns the fresh report. Mirrors the Run Tests action.',
  expose: true,
  func: async ({ metaService }) => {
    if (!metaService?.basePath) {
      throw new Error(
        'Meta service is not configured. Ensure the console addon is set up with a MetaService.'
      )
    }
    // basePath is the project's `.pikku` dir; run from the dir that holds it
    // (the project root with pikku.config.json) so audit.json lands back in it.
    await runPikkuAudit(dirname(metaService.basePath))
    return readAuditReport(metaService)
  },
})
