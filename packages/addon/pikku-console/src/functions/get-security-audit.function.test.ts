import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getSecurityAudit } from './get-security-audit.function.js'
import type { SecurityAuditReport } from '@pikku/core'

const REPORT: SecurityAuditReport = {
  schemaVersion: 1,
  tool: 'bun',
  generatedAt: '2026-07-01T00:00:00.000Z',
  issues: [
    {
      package: 'lodash',
      severity: 'high',
      title: 'Prototype pollution',
      advisoryId: 'GHSA-xxxx',
      url: 'https://github.com/advisories/GHSA-xxxx',
      vulnerableVersions: '<4.17.21',
      cwe: ['CWE-1321'],
      cvssScore: 7.5,
      recommendedVersion: '4.17.21',
    },
  ],
  updates: [{ package: 'zod', current: '3.22.0', latest: '3.23.8', level: 'minor' }],
  summary: {
    totalIssues: 1,
    critical: 0,
    high: 1,
    moderate: 0,
    low: 0,
    totalUpdates: 1,
    major: 0,
    minor: 1,
    patch: 0,
  },
}

const metaServiceReturning = (content: string | null) =>
  ({
    readFile: async (relativePath: string) => {
      assert.equal(relativePath, 'audit.json')
      return content
    },
  }) as never

const invoke = (content: string | null) =>
  getSecurityAudit.func(
    { metaService: metaServiceReturning(content) } as never,
    null as never,
    {} as never
  ) as Promise<SecurityAuditReport | null>

test('getSecurityAudit returns the parsed report from audit.json', async () => {
  const result = await invoke(JSON.stringify(REPORT))
  assert.deepEqual(result, REPORT)
})

test('getSecurityAudit returns null when audit.json is absent', async () => {
  const result = await invoke(null)
  assert.equal(result, null)
})

test('getSecurityAudit returns null when audit.json is malformed', async () => {
  const result = await invoke('{ not valid json')
  assert.equal(result, null)
})
