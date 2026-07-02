import type { ReactNode } from 'react'
import { m } from '@/i18n/messages'
import type {
  SecurityAuditReport,
  SecurityAuditIssue,
  SecuritySeverity,
  SecurityUpdateLevel,
} from '../../hooks/useSecurityAudit'
import type { AdvisoryCategory } from './security-classify'

// Per-finding remediation slot, rendered right-aligned in the finding row
// header. OSS defaults to the free "Update dependency" button; Fabric passes its
// own sandbox-verified action here.
export type RenderRemediation = (args: {
  pkg: string
  version: string
  issue: SecurityAuditIssue
}) => ReactNode

export const SEV_ORDER: SecuritySeverity[] = [
  'critical',
  'high',
  'moderate',
  'low',
  'info',
]
export const SEV_COLOR: Record<SecuritySeverity, string> = {
  critical: 'red',
  high: 'orange',
  moderate: 'yellow',
  low: 'gray',
  info: 'blue',
}
export const SEV_LABEL = {
  critical: m.security_severity_critical,
  high: m.security_severity_high,
  moderate: m.security_severity_moderate,
  low: m.security_severity_low,
  info: m.security_severity_info,
} satisfies Record<SecuritySeverity, () => string>
export const LEVEL_COLOR: Record<SecurityUpdateLevel, string> = {
  major: 'red',
  minor: 'yellow',
  patch: 'green',
  unknown: 'gray',
}
export const LEVEL_LABEL = {
  major: m.security_update_major,
  minor: m.security_update_minor,
  patch: m.security_update_patch,
  unknown: m.security_update_unknown,
} satisfies Record<SecurityUpdateLevel, () => string>
export const CAT_LABEL = {
  codeInjection: m.security_cat_code_injection,
  prototypePollution: m.security_cat_prototype_pollution,
  ssrf: m.security_cat_ssrf,
  credentialLeak: m.security_cat_credential_leak,
  headerInjection: m.security_cat_header_injection,
  csrf: m.security_cat_csrf,
  redos: m.security_cat_redos,
  dos: m.security_cat_dos,
  nullByte: m.security_cat_null_byte,
  other: m.security_cat_other,
} satisfies Record<AdvisoryCategory, () => string>
export const CAT_WHY = {
  codeInjection: m.security_cat_code_injection_why,
  prototypePollution: m.security_cat_prototype_pollution_why,
  ssrf: m.security_cat_ssrf_why,
  credentialLeak: m.security_cat_credential_leak_why,
  headerInjection: m.security_cat_header_injection_why,
  csrf: m.security_cat_csrf_why,
  redos: m.security_cat_redos_why,
  dos: m.security_cat_dos_why,
  nullByte: m.security_cat_null_byte_why,
  other: m.security_cat_other_why,
} satisfies Record<AdvisoryCategory, () => string>

export interface DepInfo {
  name: string
  current?: string
  latest?: string
  level: SecurityUpdateLevel
  counts: Record<SecuritySeverity, number>
  total: number
}

export function emptyCounts(): Record<SecuritySeverity, number> {
  return { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }
}

// Roll issues + updates up into a per-package view.
export function buildDeps(report: SecurityAuditReport): DepInfo[] {
  const map = new Map<string, DepInfo>()
  const get = (name: string): DepInfo => {
    let d = map.get(name)
    if (!d) {
      d = { name, level: 'unknown', counts: emptyCounts(), total: 0 }
      map.set(name, d)
    }
    return d
  }
  for (const u of report.updates) {
    const d = get(u.package)
    d.current = u.current
    d.latest = u.latest
    d.level = u.level
  }
  for (const i of report.issues) {
    const d = get(i.package)
    d.counts[i.severity]++
    d.total++
    if (!d.latest && i.recommendedVersion) d.latest = i.recommendedVersion
  }
  return [...map.values()].sort(
    (a, b) =>
      b.counts.critical - a.counts.critical ||
      b.counts.high - a.counts.high ||
      b.total - a.total ||
      a.name.localeCompare(b.name)
  )
}
