import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildUpgradePrompt, isUpgradable } from './upgrade-prompt.js'
import { buildDeps } from './security-view-utils.js'
import type {
  SecurityAuditIssue,
  SecurityAuditReport,
  SecurityAuditUpdate,
} from '../../hooks/useSecurityAudit'

const update = (
  pkg: string,
  current: string,
  latest: string,
  level: SecurityAuditUpdate['level']
): SecurityAuditUpdate => ({ package: pkg, current, latest, level })

const issue = (
  pkg: string,
  severity: SecurityAuditIssue['severity'],
  overrides: Partial<SecurityAuditIssue> = {}
): SecurityAuditIssue => ({
  package: pkg,
  severity,
  title: `${severity} in ${pkg}`,
  advisoryId: `GHSA-${pkg}`,
  url: '',
  vulnerableVersions: '',
  cwe: [],
  cvssScore: null,
  recommendedVersion: null,
  ...overrides,
})

const report = (
  issues: SecurityAuditIssue[],
  updates: SecurityAuditUpdate[]
): SecurityAuditReport =>
  ({
    schemaVersion: 1,
    tool: 'test',
    generatedAt: '',
    issues,
    updates,
  }) as SecurityAuditReport

describe('isUpgradable', () => {
  test('a package already on the latest version is not a target', () => {
    const [dep] = buildDeps(report([], [update('a', '1.0.0', '1.0.0', 'patch')]))
    assert.equal(isUpgradable(dep!), false)
  })

  test('a package with no known latest is not a target', () => {
    const [dep] = buildDeps(report([issue('a', 'high')], []))
    assert.equal(isUpgradable(dep!), false)
  })
})

describe('buildUpgradePrompt', () => {
  test('an empty selection produces no prompt', () => {
    assert.equal(buildUpgradePrompt([], report([], [])), '')
  })

  test('names each package, its version step and its level', () => {
    const r = report([], [update('lodash', '4.17.20', '4.17.21', 'patch')])
    const prompt = buildUpgradePrompt(buildDeps(r), r)
    assert.match(prompt, /- lodash 4\.17\.20 → 4\.17\.21 \(patch\)/)
  })

  test('lists the advisories a package carries beneath it', () => {
    const r = report(
      [issue('lodash', 'critical', { title: 'Prototype pollution' })],
      [update('lodash', '4.17.20', '4.17.21', 'patch')]
    )
    const prompt = buildUpgradePrompt(buildDeps(r), r)
    assert.match(prompt, /critical: Prototype pollution \(GHSA-lodash\)/)
  })

  test('drops packages that cannot move, keeping the ones that can', () => {
    const r = report(
      [],
      [
        update('a', '1.0.0', '1.0.0', 'patch'),
        update('b', '1.0.0', '2.0.0', 'major'),
      ]
    )
    const prompt = buildUpgradePrompt(buildDeps(r), r)
    assert.ok(!prompt.includes('- a '))
    assert.match(prompt, /- b 1\.0\.0 → 2\.0\.0 \(major\)/)
  })
})
