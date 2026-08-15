import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDeps, emptyCounts, SEV_ORDER } from './security-view-utils.js'
import type {
  SecurityAuditIssue,
  SecurityAuditReport,
  SecurityAuditUpdate,
} from '../../hooks/useSecurityAudit'

const issue = (
  pkg: string,
  severity: SecurityAuditIssue['severity'],
  overrides: Partial<SecurityAuditIssue> = {}
): SecurityAuditIssue => ({
  package: pkg,
  severity,
  title: `${severity} in ${pkg}`,
  advisoryId: `${pkg}-${severity}`,
  url: '',
  vulnerableVersions: '',
  cwe: [],
  cvssScore: null,
  recommendedVersion: null,
  ...overrides,
})

const update = (
  pkg: string,
  current: string,
  latest: string,
  level: SecurityAuditUpdate['level']
): SecurityAuditUpdate => ({ package: pkg, current, latest, level })

const report = (
  issues: SecurityAuditIssue[],
  updates: SecurityAuditUpdate[] = []
): SecurityAuditReport =>
  ({
    schemaVersion: 1,
    tool: 'bun',
    generatedAt: '2026-08-15T00:00:00.000Z',
    issues,
    updates,
    summary: {
      totalIssues: issues.length,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      totalUpdates: updates.length,
      major: 0,
      minor: 0,
      patch: 0,
    },
  }) as SecurityAuditReport

describe('emptyCounts', () => {
  test('has a bucket for every severity the report can carry', () => {
    assert.deepEqual(Object.keys(emptyCounts()).sort(), [...SEV_ORDER].sort())
    assert.ok(Object.values(emptyCounts()).every((n) => n === 0))
  })

  test('hands out a fresh object each time', () => {
    const first = emptyCounts()
    first.critical = 5
    assert.equal(emptyCounts().critical, 0)
  })
})

describe('buildDeps', () => {
  test('rolls every advisory for a package into one row', () => {
    const deps = buildDeps(
      report([
        issue('axios', 'high'),
        issue('axios', 'moderate'),
        issue('axios', 'high'),
      ])
    )
    assert.equal(deps.length, 1)
    assert.equal(deps[0]!.name, 'axios')
    assert.equal(deps[0]!.total, 3)
    assert.equal(deps[0]!.counts.high, 2)
    assert.equal(deps[0]!.counts.moderate, 1)
    assert.equal(deps[0]!.counts.critical, 0)
  })

  test('carries the version and bump level from the update', () => {
    const deps = buildDeps(
      report(
        [issue('axios', 'high')],
        [update('axios', '0.21.0', '1.19.0', 'major')]
      )
    )
    assert.deepEqual(
      {
        current: deps[0]!.current,
        latest: deps[0]!.latest,
        level: deps[0]!.level,
      },
      { current: '0.21.0', latest: '1.19.0', level: 'major' }
    )
  })

  test('lists a package that is merely outdated, with no advisories', () => {
    const deps = buildDeps(
      report([], [update('zod', '3.22.0', '3.23.8', 'minor')])
    )
    assert.equal(deps.length, 1)
    assert.equal(deps[0]!.total, 0)
    assert.deepEqual(deps[0]!.counts, emptyCounts())
  })

  test('lists a vulnerable package that has no update row', () => {
    const deps = buildDeps(report([issue('axios', 'critical')]))
    assert.equal(deps[0]!.level, 'unknown')
    assert.equal(deps[0]!.current, undefined)
    assert.equal(deps[0]!.latest, undefined)
  })

  // Without an update row there is no `latest`, but the advisory itself knows
  // which version clears it — that is what the remediation button offers.
  test('falls back to the advisory recommendation for the target version', () => {
    const deps = buildDeps(
      report([issue('minimist', 'critical', { recommendedVersion: '1.2.8' })])
    )
    assert.equal(deps[0]!.latest, '1.2.8')
  })

  test('does not let a recommendation override the real latest version', () => {
    const deps = buildDeps(
      report(
        [issue('minimist', 'critical', { recommendedVersion: '1.2.6' })],
        [update('minimist', '1.2.0', '1.2.8', 'patch')]
      )
    )
    assert.equal(deps[0]!.latest, '1.2.8')
  })

  test('sorts criticals to the top, then highs, then by volume', () => {
    const deps = buildDeps(
      report([
        issue('low-one', 'low'),
        issue('many-highs', 'high'),
        issue('many-highs', 'high'),
        issue('one-critical', 'critical'),
        issue('one-high', 'high'),
      ])
    )
    assert.deepEqual(
      deps.map((d) => d.name),
      ['one-critical', 'many-highs', 'one-high', 'low-one']
    )
  })

  // A stable order matters: the list re-renders after every audit run, and rows
  // jumping around between two equally-severe packages reads as churn.
  test('breaks a tie by name so the order is stable across runs', () => {
    const deps = buildDeps(
      report([issue('zod', 'moderate'), issue('axios', 'moderate')])
    )
    assert.deepEqual(
      deps.map((d) => d.name),
      ['axios', 'zod']
    )
  })

  test('is empty for a clean report', () => {
    assert.deepEqual(buildDeps(report([], [])), [])
  })
})
