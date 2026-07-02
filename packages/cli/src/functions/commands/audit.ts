import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pikkuSessionlessFunc } from '#pikku'
import type {
  SecurityAuditIssue,
  SecurityAuditReport,
  SecurityAuditUpdate,
} from '@pikku/core'

// `pikku audit` — dependency security audit. Security advisories are always
// reported; `--outdated` additionally reports available dependency updates.
// The normalised result is written to `.pikku/audit.json` so it rides the same
// meta pipeline as every other generated artifact (uploaded on deploy, read by
// the console). Bun is fully supported; other package managers are detected but
// stubbed with a `note` until their audit/outdated shapes are normalised.

type AuditInput = {
  outdated?: boolean
}

const SCHEMA_VERSION = 1
const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'] as const
type Severity = (typeof SEVERITY_ORDER)[number]
type PackageManager = 'bun' | 'npm' | 'yarn' | 'pnpm' | 'unknown'

// Artifact shape (SecurityAuditReport / …Issue / …Update) is the canonical type
// from @pikku/core — imported above. `Severity`/`PackageManager` below are local
// runtime-helper aliases, not a second copy of the artifact.

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

// Walk up from startDir to the nearest workspace root — the dir whose lockfile
// the package manager audits. Falls back to startDir.
function findProjectRoot(startDir: string): { root: string; pm: PackageManager } {
  let dir = startDir
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb')))
      return { root: dir, pm: 'bun' }
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) return { root: dir, pm: 'pnpm' }
    if (existsSync(join(dir, 'yarn.lock'))) return { root: dir, pm: 'yarn' }
    if (existsSync(join(dir, 'package-lock.json'))) return { root: dir, pm: 'npm' }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { root: startDir, pm: 'unknown' }
}

function runBun(args: string[], cwd: string): string {
  const res = spawnSync('bun', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: '1' },
  })
  // A launch failure (bun missing, timeout, maxBuffer exceeded) or a non-zero
  // exit with *no* output means the audit never produced data — surface it so a
  // failed run can't masquerade as "0 advisories". (bun audit exits non-zero
  // WHEN it finds advisories, but still writes the payload to stdout, so a
  // non-zero exit *with* stdout is fine.)
  if (res.error || (res.status !== 0 && !res.stdout)) {
    throw new Error(
      `bun ${args.join(' ')} failed: ${res.error?.message ?? res.stderr ?? `exit ${res.status}`}`
    )
  }
  return res.stdout || ''
}

function normaliseSeverity(sev: unknown): Severity {
  const s = String(sev ?? '').toLowerCase()
  return (SEVERITY_ORDER as readonly string[]).includes(s) ? (s as Severity) : 'info'
}

// bun audit --json → { "<pkg>": [ { id, url, title, severity, vulnerable_versions, cwe[], cvss:{score} } ] }
function parseBunAudit(raw: string): SecurityAuditIssue[] {
  const issues: SecurityAuditIssue[] = []
  let obj: Record<string, any>
  try {
    const start = raw.indexOf('{')
    obj = start >= 0 ? JSON.parse(raw.slice(start)) : {}
  } catch {
    return issues
  }
  const map = obj && typeof obj.advisories === 'object' && obj.advisories ? obj.advisories : obj
  if (!map || typeof map !== 'object') return issues
  for (const [pkg, list] of Object.entries(map)) {
    const advisories = Array.isArray(list) ? list : [list]
    for (const a of advisories as any[]) {
      if (!a || typeof a !== 'object') continue
      issues.push({
        package: a.module_name || a.name || pkg,
        severity: normaliseSeverity(a.severity),
        title: String(a.title || a.overview || 'Vulnerability').slice(0, 300),
        advisoryId: a.id != null ? String(a.id) : a.github_advisory_id || '',
        url: a.url || a.advisory || '',
        vulnerableVersions: a.vulnerable_versions || a.vulnerableVersions || '',
        cwe: Array.isArray(a.cwe) ? a.cwe : a.cwe ? [String(a.cwe)] : [],
        cvssScore: a.cvss && typeof a.cvss.score === 'number' && a.cvss.score > 0 ? a.cvss.score : null,
        recommendedVersion: null,
      })
    }
  }
  return issues
}

function semverLevel(current: string, latest: string): SecurityAuditUpdate['level'] {
  const c = String(current).replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10))
  const l = String(latest).replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10))
  if (Number.isNaN(c[0]) || Number.isNaN(l[0])) return 'unknown'
  if (l[0] > c[0]) return 'major'
  if ((l[1] || 0) > (c[1] || 0)) return 'minor'
  if ((l[2] || 0) > (c[2] || 0)) return 'patch'
  return 'unknown'
}

// bun outdated has no --json; it prints a table: | Package | Current | Update | Latest |
function parseBunOutdated(raw: string): SecurityAuditUpdate[] {
  const updates: SecurityAuditUpdate[] = []
  const seen = new Set<string>()
  for (const line of stripAnsi(raw).split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0)
    if (cells.length !== 4) continue
    const [pkg, current, , latest] = cells
    if (pkg === 'Package' || /^-+$/.test(pkg)) continue
    if (!/^\d/.test(current) || !/^\d/.test(latest)) continue
    if (seen.has(pkg)) continue
    seen.add(pkg)
    updates.push({ package: pkg, current, latest, level: semverLevel(current, latest) })
  }
  return updates
}

function summarise(
  tool: PackageManager,
  issues: SecurityAuditIssue[],
  updates: SecurityAuditUpdate[],
  note?: string,
): SecurityAuditReport {
  issues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  const count = <T>(arr: T[], key: keyof T, val: unknown) =>
    arr.filter((x) => x[key] === val).length
  return {
    schemaVersion: SCHEMA_VERSION,
    tool,
    generatedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    issues,
    updates,
    summary: {
      totalIssues: issues.length,
      critical: count(issues, 'severity', 'critical'),
      high: count(issues, 'severity', 'high'),
      moderate: count(issues, 'severity', 'moderate'),
      low: count(issues, 'severity', 'low'),
      totalUpdates: updates.length,
      major: count(updates, 'level', 'major'),
      minor: count(updates, 'level', 'minor'),
      patch: count(updates, 'level', 'patch'),
    },
  }
}

export const pikkuAudit = pikkuSessionlessFunc<AuditInput, void>({
  func: async ({ logger, config }, input) => {
    const includeOutdated = input?.outdated === true
    const { root, pm } = findProjectRoot(config.rootDir)

    let report: SecurityAuditReport
    if (pm === 'bun') {
      try {
        const issues = parseBunAudit(runBun(['audit', '--json'], root))
        const updates = includeOutdated ? parseBunOutdated(runBun(['outdated'], root)) : []
        const latestByPkg = new Map(updates.map((u) => [u.package, u.latest]))
        for (const i of issues) i.recommendedVersion = latestByPkg.get(i.package) ?? null
        report = summarise('bun', issues, updates)
      } catch (e) {
        // A failed run must NOT read as clean — emit a note so the UI shows
        // "audit not run" instead of a reassuring "no vulnerabilities".
        report = summarise(
          'bun',
          [],
          [],
          `Security audit could not run: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    } else {
      report = summarise(
        pm,
        [],
        [],
        `Security audit is not yet supported for the '${pm}' package manager — only bun is implemented.`,
      )
    }

    const outFile = join(config.outDir, 'audit.json')
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(outFile, JSON.stringify(report, null, 2))

    const { summary } = report
    if (report.note) {
      logger.info(`pikku audit — ${report.note}`)
    } else {
      logger.info(
        `pikku audit — ${summary.totalIssues} advisory(ies)` +
          ` (${summary.critical} critical, ${summary.high} high, ${summary.moderate} moderate, ${summary.low} low)` +
          (includeOutdated ? `, ${summary.totalUpdates} available update(s)` : ''),
      )
    }
    logger.info(`  → ${outFile}`)
  },
})
