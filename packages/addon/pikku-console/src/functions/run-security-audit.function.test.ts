import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SecurityAuditReport } from '@pikku/core/types'
import { runSecurityAudit } from './run-security-audit.function.js'

const REPORT: SecurityAuditReport = {
  schemaVersion: 1,
  tool: 'bun',
  generatedAt: '2026-08-15T00:00:00.000Z',
  issues: [
    {
      package: 'minimist',
      severity: 'critical',
      title: 'Prototype Pollution in minimist',
      advisoryId: '1097678',
      url: 'https://github.com/advisories/GHSA-xvch-5gv4-984h',
      vulnerableVersions: '>=1.0.0 <1.2.6',
      cwe: ['CWE-1321'],
      cvssScore: 9.8,
      recommendedVersion: '1.2.8',
    },
  ],
  updates: [
    { package: 'minimist', current: '1.2.0', latest: '1.2.8', level: 'patch' },
  ],
  summary: {
    totalIssues: 1,
    critical: 1,
    high: 0,
    moderate: 0,
    low: 0,
    totalUpdates: 1,
    major: 0,
    minor: 0,
    patch: 1,
  },
}

/**
 * A project whose `node_modules/.bin/pikku` writes a known report, so the RPC's
 * real "shell out, then read the artefact back" chain runs end to end.
 */
const project = ({ writesReport = true }: { writesReport?: boolean } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-run-audit-'))
  const log = join(root, 'calls.log')
  const auditPath = join(root, '.pikku', 'audit.json')
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(
    join(root, 'node_modules', '.bin', 'pikku'),
    `import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'\n` +
      `appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(' ') + '|' + process.cwd() + '\\n')\n` +
      (writesReport
        ? `mkdirSync(${JSON.stringify(join(root, '.pikku'))}, { recursive: true })\n` +
          `writeFileSync(${JSON.stringify(auditPath)}, ${JSON.stringify(JSON.stringify(REPORT))})\n`
        : '')
  )

  return {
    root,
    metaService: {
      basePath: join(root, '.pikku'),
      readFile: async (relativePath: string) => {
        const path = join(root, '.pikku', relativePath)
        return existsSync(path) ? readFileSync(path, 'utf-8') : null
      },
    },
    calls: () => (existsSync(log) ? readFileSync(log, 'utf-8').trim() : ''),
  }
}

const invoke = (metaService: unknown) =>
  runSecurityAudit.func(
    { metaService } as never,
    null as never,
    {} as never
  ) as Promise<SecurityAuditReport | null>

describe('runSecurityAudit', () => {
  test('refuses to run without a configured meta service', async () => {
    await assert.rejects(invoke(undefined), /Meta service is not configured/)
    await assert.rejects(invoke({}), /Meta service is not configured/)
  })

  test('runs the audit and returns the freshly written report', async () => {
    const p = project()
    const report = await invoke(p.metaService)

    assert.equal(report?.summary.critical, 1)
    assert.equal(report?.issues[0]!.package, 'minimist')
    assert.equal(report?.issues[0]!.recommendedVersion, '1.2.8')
  })

  test('asks for updates too, so the report can recommend a version', async () => {
    const p = project()
    await invoke(p.metaService)
    assert.match(p.calls(), /audit --outdated/)
  })

  // basePath is the `.pikku` directory; running from inside it would write the
  // artefact to `.pikku/.pikku/audit.json`, where nothing would ever read it.
  test('runs from the project root that holds .pikku, not from inside it', async () => {
    const p = project()
    await invoke(p.metaService)
    const [, cwd] = p.calls().split('|')
    assert.equal(
      readFileSync(join(cwd!, 'node_modules/.bin/pikku')).length > 0,
      true
    )
    assert.ok(!cwd!.endsWith('.pikku'))
  })

  test('returns null when the audit produced no report', async () => {
    const p = project({ writesReport: false })
    assert.equal(await invoke(p.metaService), null)
  })
})
