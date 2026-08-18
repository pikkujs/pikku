import { pikkuFunc } from '#pikku/addon/function'
import type { SecurityAuditReport } from '@pikku/core/types'
import { readAuditReport } from '../lib/audit-exec.js'

export const getSecurityAudit = pikkuFunc<null, SecurityAuditReport | null>({
  title: 'Get Security Audit',
  description:
    'Returns the dependency security audit (vulnerabilities + available updates) from the generated .pikku/audit.json, or null if `pikku audit` has not been run.',
  expose: true,
  scopes: ['pikku:console:security:read'],
  func: async ({ metaService }) => readAuditReport(metaService),
})
