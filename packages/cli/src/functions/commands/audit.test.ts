import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SecurityAuditReport } from '@pikku/core/ecosystem/types'
import {
  findProjectRoot,
  parseBunAudit,
  parseBunOutdated,
  pikkuAudit,
  semverLevel,
  summarise,
} from './audit.js'

const scratch = () => mkdtempSync(join(tmpdir(), 'pikku-audit-'))

// Verbatim `bun audit --json` output (bun 1.3.14) for a project pinned to
// lodash@4.17.20 / minimist@1.2.0, trimmed to four advisories. The leading
// banner line is part of what bun really writes to stdout, so it stays.
const BUN_AUDIT_JSON = `\x1b[0m\x1b[1mbun audit \x1b[0m\x1b[2mv1.3.14 (0d9b296a)\x1b[0m
{"lodash":[{"id":1106913,"url":"https://github.com/advisories/GHSA-35jh-r3h4-6jhm","title":"Command Injection in lodash","severity":"high","vulnerable_versions":"<4.17.21","cwe":["CWE-77","CWE-94"],"cvss":{"score":7.2,"vectorString":"CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H"}},{"id":1108258,"url":"https://github.com/advisories/GHSA-29mw-wpgm-hmr9","title":"Regular Expression Denial of Service (ReDoS) in lodash","severity":"moderate","vulnerable_versions":">=4.0.0 <4.17.21","cwe":["CWE-400","CWE-1333"],"cvss":{"score":5.3,"vectorString":"CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"}}],"minimist":[{"id":1097678,"url":"https://github.com/advisories/GHSA-xvch-5gv4-984h","title":"Prototype Pollution in minimist","severity":"critical","vulnerable_versions":">=1.0.0 <1.2.6","cwe":["CWE-1321"],"cvss":{"score":9.8,"vectorString":"CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"}},{"id":1111034,"url":"https://github.com/advisories/GHSA-jr5f-v2jv-69x6","title":"axios Requests Vulnerable To Possible SSRF and Credential Leakage via Absolute URL","severity":"high","vulnerable_versions":"<0.30.0","cwe":["CWE-918"],"cvss":{"score":0,"vectorString":null}}]}`

// Verbatim `bun outdated` output (bun 1.3.14). It has no --json mode, so the
// parser reads this table — including the full-width borders, the header row
// and the per-row separators, each of which must be skipped.
const BUN_OUTDATED_TABLE = `bun outdated v1.3.14 (0d9b296a)
|----------------------------------|
| Package  | Current | Update | Latest |
|----------|---------|--------|--------|
| axios    | 0.21.0  | 0.21.0 | 1.19.0 |
|----------|---------|--------|--------|
| lodash   | 4.17.20 | 4.17.20 | 4.18.1 |
|----------|---------|--------|--------|
| minimist | 1.2.0   | 1.2.0  | 1.2.8  |
|----------------------------------|
`

describe('parseBunAudit', () => {
  test('reads advisories out of real bun output, banner and all', () => {
    const issues = parseBunAudit(BUN_AUDIT_JSON)
    assert.equal(issues.length, 4)

    const critical = issues.find((i) => i.severity === 'critical')
    assert.deepEqual(critical, {
      package: 'minimist',
      severity: 'critical',
      title: 'Prototype Pollution in minimist',
      advisoryId: '1097678',
      url: 'https://github.com/advisories/GHSA-xvch-5gv4-984h',
      vulnerableVersions: '>=1.0.0 <1.2.6',
      cwe: ['CWE-1321'],
      cvssScore: 9.8,
      recommendedVersion: null,
    })
  })

  test('keys the issue by the package the advisory is filed under', () => {
    const packages = parseBunAudit(BUN_AUDIT_JSON).map((i) => i.package)
    assert.deepEqual(new Set(packages), new Set(['lodash', 'minimist']))
  })

  // bun reports score 0 for advisories with no CVSS vector. Surfacing that as
  // "0.0" would read as "assessed and harmless" rather than "not scored".
  test('treats an unscored advisory as unscored, not as a zero score', () => {
    const unscored = parseBunAudit(BUN_AUDIT_JSON).find(
      (i) => i.advisoryId === '1111034'
    )
    assert.equal(unscored?.cvssScore, null)
  })

  test('accepts the advisories-wrapped shape as well as the bare map', () => {
    const wrapped = JSON.stringify({
      advisories: {
        ws: [{ id: 7, severity: 'low', title: 'DoS', url: 'https://x' }],
      },
    })
    const issues = parseBunAudit(wrapped)
    assert.equal(issues.length, 1)
    assert.equal(issues[0]!.package, 'ws')
  })

  test('accepts a lone advisory object where a list is expected', () => {
    const issues = parseBunAudit(
      JSON.stringify({ ws: { id: 7, severity: 'high', title: 'DoS' } })
    )
    assert.equal(issues.length, 1)
    assert.equal(issues[0]!.severity, 'high')
  })

  test('normalises an unrecognised severity to info rather than dropping it', () => {
    const issues = parseBunAudit(
      JSON.stringify({ ws: [{ id: 1, severity: 'SPICY', title: 'x' }] })
    )
    assert.equal(issues[0]!.severity, 'info')
  })

  test('survives output that is not JSON at all', () => {
    assert.deepEqual(parseBunAudit('bun audit v1.3.14\nno vulnerabilities'), [])
    assert.deepEqual(parseBunAudit(''), [])
    assert.deepEqual(parseBunAudit('{ truncated'), [])
  })

  test('caps a pathologically long advisory title', () => {
    const issues = parseBunAudit(
      JSON.stringify({
        ws: [{ id: 1, severity: 'low', title: 'x'.repeat(900) }],
      })
    )
    assert.equal(issues[0]!.title.length, 300)
  })
})

describe('parseBunOutdated', () => {
  test('reads the update rows out of the real table', () => {
    assert.deepEqual(parseBunOutdated(BUN_OUTDATED_TABLE), [
      { package: 'axios', current: '0.21.0', latest: '1.19.0', level: 'major' },
      {
        package: 'lodash',
        current: '4.17.20',
        latest: '4.18.1',
        level: 'minor',
      },
      {
        package: 'minimist',
        current: '1.2.0',
        latest: '1.2.8',
        level: 'patch',
      },
    ])
  })

  // The header, the separators and the full-width borders all contain `|`, and
  // the separators split into exactly four cells like a real row does.
  test('skips the header, the separators and the borders', () => {
    const packages = parseBunOutdated(BUN_OUTDATED_TABLE).map((u) => u.package)
    assert.ok(!packages.includes('Package'))
    assert.ok(!packages.some((p) => /^-+$/.test(p)))
  })

  test('strips the colour codes bun emits when it thinks it has a TTY', () => {
    const coloured =
      '| \x1b[1maxios\x1b[0m | \x1b[2m0.21.0\x1b[0m | 0.21.0 | \x1b[32m1.19.0\x1b[0m |'
    assert.deepEqual(parseBunOutdated(coloured), [
      { package: 'axios', current: '0.21.0', latest: '1.19.0', level: 'major' },
    ])
  })

  test('reports each package once even when it appears in several workspaces', () => {
    const dupes = `| axios | 0.21.0 | 0.21.0 | 1.19.0 |
| axios | 0.22.0 | 0.22.0 | 1.19.0 |`
    const updates = parseBunOutdated(dupes)
    assert.equal(updates.length, 1)
    assert.equal(updates[0]!.current, '0.21.0')
  })

  test('ignores rows whose version cells are not versions', () => {
    const noise = `| some prose | that | happens | to have pipes |
| axios | workspace:* | workspace:* | 1.19.0 |`
    assert.deepEqual(parseBunOutdated(noise), [])
  })

  test('is empty when nothing is outdated', () => {
    assert.deepEqual(parseBunOutdated('bun outdated v1.3.14\n'), [])
  })

  // bun annotates the dependency section in the Package cell. Keeping the
  // annotation in the name breaks everything keyed on it: package.json has no
  // "@types/node (dev)" to bump, and an advisory for a dev dependency never
  // joins to its update, so it is offered no version to move to.
  test('reads the package name without the section bun annotates it with', () => {
    const annotated = `| @types/node (dev)            | 24.13.3 | 24.13.3 | 26.2.0 |
| eslint (peer)                | 8.0.0   | 8.0.0   | 9.0.0  |
| fsevents (optional)          | 2.3.2   | 2.3.2   | 2.3.3  |`
    assert.deepEqual(
      parseBunOutdated(annotated).map((u) => u.package),
      ['@types/node', 'eslint', 'fsevents']
    )
  })

  test('does not list a package twice for depending on it in two sections', () => {
    const both = `| typescript       | 6.0.3 | 6.0.3 | 7.0.2 |
| typescript (dev) | 6.0.3 | 6.0.3 | 7.0.2 |`
    assert.deepEqual(parseBunOutdated(both), [
      {
        package: 'typescript',
        current: '6.0.3',
        latest: '7.0.2',
        level: 'major',
      },
    ])
  })

  test('leaves a name that merely contains a bracket alone', () => {
    const odd = '| some (thing) | 1.0.0 | 1.0.0 | 2.0.0 |'
    assert.equal(parseBunOutdated(odd)[0]!.package, 'some (thing)')
  })
})

describe('semverLevel', () => {
  test('classifies the bump', () => {
    assert.equal(semverLevel('0.21.0', '1.19.0'), 'major')
    assert.equal(semverLevel('4.17.20', '4.18.1'), 'minor')
    assert.equal(semverLevel('1.2.0', '1.2.8'), 'patch')
  })

  test('reads through a range operator', () => {
    assert.equal(semverLevel('^1.0.0', '2.0.0'), 'major')
    assert.equal(semverLevel('~1.0.0', '1.1.0'), 'minor')
  })

  test('is unknown rather than wrong when a version is not numeric', () => {
    assert.equal(semverLevel('workspace:*', '1.0.0'), 'unknown')
    assert.equal(semverLevel('1.0.0', 'latest'), 'unknown')
  })

  test('is unknown when the versions are equal or the latest is behind', () => {
    assert.equal(semverLevel('1.2.3', '1.2.3'), 'unknown')
    assert.equal(semverLevel('2.0.0', '1.9.9'), 'unknown')
  })
})

describe('findProjectRoot', () => {
  const withLockfile = (name: string) => {
    const root = scratch()
    const nested = join(root, 'packages', 'api', 'src')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(root, name), '')
    return { root, nested }
  }

  test('walks up to the workspace root that holds the lockfile', () => {
    const { root, nested } = withLockfile('bun.lock')
    assert.deepEqual(findProjectRoot(nested), { root, pm: 'bun' })
  })

  test('recognises each package manager by its lockfile', () => {
    for (const [file, pm] of [
      ['bun.lock', 'bun'],
      ['bun.lockb', 'bun'],
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['package-lock.json', 'npm'],
    ] as const) {
      const { root, nested } = withLockfile(file)
      assert.deepEqual(findProjectRoot(nested), { root, pm }, file)
    }
  })

  // A yarn workspace that also has a stray bun.lockb should audit with bun,
  // since bun is the only manager whose output is normalised.
  test('prefers bun when a directory holds more than one lockfile', () => {
    const root = scratch()
    writeFileSync(join(root, 'yarn.lock'), '')
    writeFileSync(join(root, 'bun.lock'), '')
    assert.equal(findProjectRoot(root).pm, 'bun')
  })

  test('falls back to the start directory when there is no lockfile', () => {
    const root = scratch()
    assert.deepEqual(findProjectRoot(root), { root, pm: 'unknown' })
  })
})

describe('summarise', () => {
  const issue = (severity: string, pkg = 'p') =>
    ({
      package: pkg,
      severity,
      title: 't',
      advisoryId: 'a',
      url: '',
      vulnerableVersions: '',
      cwe: [],
      cvssScore: null,
      recommendedVersion: null,
    }) as SecurityAuditReport['issues'][number]

  const update = (level: string) =>
    ({
      package: 'p',
      current: '1.0.0',
      latest: '2.0.0',
      level,
    }) as SecurityAuditReport['updates'][number]

  test('counts each severity and each update level', () => {
    const report = summarise(
      'bun',
      [issue('high'), issue('high'), issue('critical'), issue('low')],
      [update('major'), update('patch')]
    )
    assert.deepEqual(report.summary, {
      totalIssues: 4,
      critical: 1,
      high: 2,
      moderate: 0,
      low: 1,
      totalUpdates: 2,
      major: 1,
      minor: 0,
      patch: 1,
    })
  })

  test('orders issues worst-first so the UI leads with the critical one', () => {
    const report = summarise(
      'bun',
      [issue('low'), issue('critical'), issue('moderate'), issue('high')],
      []
    )
    assert.deepEqual(
      report.issues.map((i) => i.severity),
      ['critical', 'high', 'moderate', 'low']
    )
  })

  test('carries a note only when one is given', () => {
    assert.equal(summarise('bun', [], []).note, undefined)
    assert.equal(
      summarise('npm', [], [], 'not supported').note,
      'not supported'
    )
  })

  test('stamps the schema version and the tool that produced it', () => {
    const report = summarise('pnpm', [], [])
    assert.equal(report.schemaVersion, 1)
    assert.equal(report.tool, 'pnpm')
    assert.ok(!Number.isNaN(Date.parse(report.generatedAt)))
  })
})

describe('pikku audit', () => {
  // A `bun` on PATH that replays recorded output. The command shells out to
  // whatever `bun` resolves to, so this exercises the real spawn/parse/write
  // path — including the failure path, which a working bun cannot produce.
  const projectWith = (bunScript: string) => {
    const root = scratch()
    const bin = join(root, 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(root, 'bun.lock'), '')
    const bun = join(bin, 'bun')
    writeFileSync(bun, bunScript)
    chmodSync(bun, 0o755)
    return { root, bin, outDir: join(root, '.pikku') }
  }

  const messages: string[] = []
  const logger = {
    info: (m: string) => messages.push(m),
    error: () => {},
    warn: () => {},
    debug: () => {},
  }

  const run = async (
    root: string,
    outDir: string,
    bin: string | null,
    input: { outdated?: boolean } = {}
  ): Promise<SecurityAuditReport> => {
    const previousPath = process.env.PATH
    if (bin) process.env.PATH = `${bin}:${previousPath}`
    try {
      await pikkuAudit.func(
        { logger, config: { rootDir: root, outDir } } as never,
        input as never,
        {} as never
      )
    } finally {
      process.env.PATH = previousPath
    }
    return JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf-8'))
  }

  test('writes a normalised report to .pikku/audit.json', async () => {
    const { root, bin, outDir } = projectWith(
      `#!/bin/sh\ncat <<'JSON'\n${BUN_AUDIT_JSON}\nJSON\n`
    )
    const report = await run(root, outDir, bin)

    assert.equal(report.tool, 'bun')
    assert.equal(report.summary.totalIssues, 4)
    assert.equal(report.summary.critical, 1)
    assert.equal(report.summary.high, 2)
    assert.equal(report.issues[0]!.severity, 'critical')
    assert.equal(report.note, undefined)
  })

  test('leaves updates alone unless --outdated is passed', async () => {
    const { root, bin, outDir } = projectWith(
      `#!/bin/sh\nif [ "$1" = "outdated" ]; then cat <<'TABLE'\n${BUN_OUTDATED_TABLE}\nTABLE\nelse cat <<'JSON'\n${BUN_AUDIT_JSON}\nJSON\nfi\n`
    )

    const without = await run(root, outDir, bin)
    assert.deepEqual(without.updates, [])
    assert.equal(without.summary.totalUpdates, 0)

    const with_ = await run(root, outDir, bin, { outdated: true })
    assert.equal(with_.summary.totalUpdates, 3)
    assert.equal(with_.summary.major, 1)
  })

  // The whole point of --outdated for a vulnerable package: say which version
  // clears the advisory, so the UI can offer a one-click bump.
  test('tells a vulnerable package which version to move to', async () => {
    const { root, bin, outDir } = projectWith(
      `#!/bin/sh\nif [ "$1" = "outdated" ]; then cat <<'TABLE'\n${BUN_OUTDATED_TABLE}\nTABLE\nelse cat <<'JSON'\n${BUN_AUDIT_JSON}\nJSON\nfi\n`
    )
    const report = await run(root, outDir, bin, { outdated: true })

    const minimist = report.issues.find((i) => i.package === 'minimist')
    assert.equal(minimist!.recommendedVersion, '1.2.8')
  })

  test('leaves recommendedVersion null for a package with no known update', async () => {
    const { root, bin, outDir } = projectWith(
      `#!/bin/sh\nif [ "$1" = "outdated" ]; then echo ""; else cat <<'JSON'\n${BUN_AUDIT_JSON}\nJSON\nfi\n`
    )
    const report = await run(root, outDir, bin, { outdated: true })
    assert.ok(report.issues.every((i) => i.recommendedVersion === null))
  })

  // The regression that matters most: a run that never happened must not be
  // indistinguishable from a run that found nothing.
  test('a failed bun run is reported as a failure, not as a clean bill', async () => {
    const { root, bin, outDir } = projectWith(
      `#!/bin/sh\necho "error: lockfile is corrupt" >&2\nexit 1\n`
    )
    const report = await run(root, outDir, bin)

    assert.equal(report.summary.totalIssues, 0)
    assert.match(report.note ?? '', /could not run/i)
    assert.match(report.note ?? '', /lockfile is corrupt/)
  })

  test('a missing bun is reported as a failure too', async () => {
    const root = scratch()
    writeFileSync(join(root, 'bun.lock'), '')
    const outDir = join(root, '.pikku')
    const previousPath = process.env.PATH
    process.env.PATH = join(root, 'empty-bin')
    let report: SecurityAuditReport
    try {
      report = await run(root, outDir, null)
    } finally {
      process.env.PATH = previousPath
    }
    assert.match(report.note ?? '', /could not run/i)
  })

  // bun audit exits non-zero *because* it found advisories, while still
  // writing the payload. Treating that as a failure would hide every finding.
  test('a non-zero exit that still produced a report is not a failure', async () => {
    const { root, bin, outDir } = projectWith(
      `#!/bin/sh\ncat <<'JSON'\n${BUN_AUDIT_JSON}\nJSON\nexit 1\n`
    )
    const report = await run(root, outDir, bin)

    assert.equal(report.note, undefined)
    assert.equal(report.summary.totalIssues, 4)
  })

  test('says so instead of staying silent when the project is not on bun', async () => {
    const root = scratch()
    writeFileSync(join(root, 'yarn.lock'), '')
    const outDir = join(root, '.pikku')
    const report = await run(root, outDir, null)

    assert.equal(report.tool, 'yarn')
    assert.equal(report.summary.totalIssues, 0)
    assert.match(report.note ?? '', /not yet supported/i)
    assert.match(report.note ?? '', /yarn/)
  })

  test('logs the note rather than a reassuring count when the audit did not run', async () => {
    const { root, bin, outDir } = projectWith(`#!/bin/sh\nexit 1\n`)
    messages.length = 0
    await run(root, outDir, bin)

    assert.ok(messages.some((m) => /could not run/i.test(m)))
    assert.ok(!messages.some((m) => /0 advisory/.test(m)))
  })

  test('logs the counts on a successful audit', async () => {
    const { root, bin, outDir } = projectWith(
      `#!/bin/sh\ncat <<'JSON'\n${BUN_AUDIT_JSON}\nJSON\n`
    )
    messages.length = 0
    await run(root, outDir, bin)

    assert.ok(messages.some((m) => /4 advisory\(ies\)/.test(m)))
    assert.ok(messages.some((m) => /1 critical, 2 high/.test(m)))
  })

  test('creates .pikku when it does not exist yet', async () => {
    const { root, bin } = projectWith(
      `#!/bin/sh\ncat <<'JSON'\n${BUN_AUDIT_JSON}\nJSON\n`
    )
    const outDir = join(root, 'nested', 'deeper', '.pikku')
    const report = await run(root, outDir, bin)
    assert.equal(report.schemaVersion, 1)
  })
})
