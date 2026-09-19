import type { SecurityAuditReport } from '../../hooks/useSecurityAudit'
import type { DepInfo } from './security-view-utils'

/** A package the audit knows how to move, and how far. */
export const isUpgradable = (dep: DepInfo): boolean =>
  !!dep.latest && dep.latest !== dep.current

/**
 * The instruction a coding agent needs to carry out a chosen upgrade set. Shared
 * so the OSS "copy prompt" action and a host that dispatches the work itself
 * hand the agent exactly the same text.
 */
export function buildUpgradePrompt(
  deps: DepInfo[],
  report: SecurityAuditReport
): string {
  const targets = deps.filter(isUpgradable)
  if (targets.length === 0) return ''

  const advisoriesFor = (name: string) =>
    report.issues.filter((issue) => issue.package === name)

  const lines = targets.map((dep) => {
    const step = dep.current
      ? `${dep.current} → ${dep.latest}`
      : `→ ${dep.latest}`
    const head = `- ${dep.name} ${step} (${dep.level})`
    const advisories = advisoriesFor(dep.name).map((issue) => {
      const id = issue.advisoryId ? ` (${issue.advisoryId})` : ''
      return `  - ${issue.severity}: ${issue.title}${id}`
    })
    return [head, ...advisories].join('\n')
  })

  return [
    'Upgrade these dependencies, then fix whatever the upgrade breaks:',
    '',
    lines.join('\n'),
    '',
    'Update every package.json that declares each package, regenerate the lockfile, then run the typecheck and the test suite. Fix only what the upgrade broke — do not change behaviour beyond what the new versions require.',
  ].join('\n')
}
