import { fileURLToPath } from 'node:url'
import type { PlatformServiceContributor } from '@pikku/deploy'

export const audit: PlatformServiceContributor = {
  name: 'audit',
  imports: [
    `import { AuditLog } from ${JSON.stringify(fileURLToPath(new URL('../src/audit-log.ts', import.meta.url)))}`,
  ],
  emit: () => [
    `  const auditLog = new AuditLog({`,
    `    label: env.AUDIT_LABEL ?? 'dev',`,
    `    onError: (error) => console.warn(error instanceof Error ? error.message : String(error)),`,
    `  })`,
    `  auditLog.record('boot')`,
    `  services.auditLog = auditLog`,
  ],
}
