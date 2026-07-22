import { pikkuFunc } from '#pikku'
import type { SecurityAuditReport } from '@pikku/core'
import { readAuditReport } from '../lib/audit-exec.js'

export const getSecurityAudit = pikkuFunc<null, SecurityAuditReport | null>({
  title: 'Get Security Audit',
  description:
    'Returns the dependency security audit (vulnerabilities + available updates) from the generated .pikku/audit.json, or null if `pikku audit` has not been run.',
  expose: true,
  func: async ({ metaService }) => readAuditReport(metaService),
})
