import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'
import { localChangesRPC } from '../../lib/changes-local.js'
import { HarnessInfraError } from '../finding.js'
import { createGateWire } from '../gate.js'
import { gitIn } from '../git.js'
import { removeThrowaways, throwawayRepo } from '../test-support.js'
import { guardWrites, snapshotTree } from '../write-guard.js'
import { pagesGate } from './pages.js'
import {
  pageFindings,
  readCompareReport,
  readWaivers,
  type PageNeed,
} from './pages-parser.js'

after(removeThrowaways)

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const FAKE_COMPARE = join(fixtures, 'fake-pages-compare.mjs')
const REASON =
  'The original zooms its phone layout out to 320 px wide; a page laid out for the phone cannot match it.'

/**
 * A report.json of a real compare (lab run step-w6, apps/app against www.wildwomanreborn.com at 1440 px), cut
 * to four rows: events over the threshold with style and section differences, reviews within it, about-5
 * missing; and an error row from another real run (fix-smoke-changesets), renamed `about`. The diff paths
 * were moved from the run's own out folder to `.pikku/compare/app/`, where the gate writes.
 */
const realReport = () =>
  readCompareReport(
    readFileSync(join(fixtures, 'pages-compare.report.json'), 'utf8')
  )

const need = (id: string, width = 1440): PageNeed => ({
  id,
  width,
  path: id === 'index' ? '/' : `/${id}`,
})

describe('the compare report (pages-parser)', () => {
  test('a page within the threshold finds nothing', () => {
    assert.deepEqual(
      pageFindings({
        report: realReport(),
        needs: [need('reviews')],
        threshold: 40,
        diffDir: '.pikku/compare/app',
      }),
      []
    )
  })

  test('a page over the threshold says by how much, its height, its worst style and section differences and where its diff image is', () => {
    const [finding, ...rest] = pageFindings({
      report: realReport(),
      needs: [need('events')],
      threshold: 40,
      diffDir: '.pikku/compare/app',
    })
    assert.equal(rest.length, 0)
    assert.equal(finding!.severity, 'high')
    assert.equal(finding!.rule, 'harness/page-compare')
    const lines = finding!.message.split('\n')
    assert.equal(
      lines[0],
      '/events at 1440 px differs from the original: 71.81% of its pixels changed, over the 40% limit. Your page is 8236 px tall, the original 21293 px (-13057 px).'
    )
    assert.equal(lines[1], 'Style differences, worst first:')
    assert.equal(
      lines[2],
      '  primary button/link: original 17px 400 #ffffff; yours 14px 500 #ffffff'
    )
    assert.match(
      finding!.message,
      /\n {2}h1: original 56px 700 #ae1a2c left; yours 48px 700 #ae1a2c left\n/
    )
    assert.match(
      finding!.message,
      /\nSection differences:\n {2}section 1 of the original .* has no counterpart in your page\n/
    )
    // at most four section notes of the six the report has
    assert.equal(
      lines.filter((l) => /^ {2}(section|multi|page height)/.test(l)).length,
      4
    )
    assert.match(
      finding!.message,
      /\nDiff image \(the original on the left, changed pixels in red in the middle, yours on the right\): \.pikku\/compare\/app\/events-1440\.diff\.png\n/
    )
    assert.match(finding!.message, /the compare runs again after you stop\.$/)
  })

  test('a missing page and a page the compare could not photograph are high findings', () => {
    const findings = pageFindings({
      report: realReport(),
      needs: [need('about-5'), need('about')],
      threshold: 40,
      diffDir: '.pikku/compare/app',
    })
    assert.deepEqual(
      findings.map((f) => [f.severity, f.message.split(':')[0]]),
      [
        ['high', 'MISSING /about-5 at 1440 px'],
        ['high', 'ERROR /about at 1440 px'],
      ]
    )
    assert.match(
      findings[1]!.message,
      /undefined is not an object \(evaluating 'A\.length'\)/
    )
  })

  test('a report of the real CLI (pikku ui pages compare on a lab clone, /women-s-circle at 390, 1440 and 1920 px) reads; only the phone width is over a 15% limit', () => {
    const report = readCompareReport(
      readFileSync(join(fixtures, 'pages-compare-real.report.json'), 'utf8')
    )
    const needs = [390, 1440, 1920].map((width) => ({
      id: 'women-s-circle',
      width,
      path: '/women-s-circle',
    }))
    assert.deepEqual(
      pageFindings({
        report,
        needs,
        threshold: 40,
        diffDir: '.pikku/compare/app',
      }),
      []
    )
    const [finding, ...rest] = pageFindings({
      report,
      needs,
      threshold: 15,
      diffDir: '.pikku/compare/app',
    })
    assert.equal(rest.length, 0)
    assert.match(
      finding!.message,
      /^\/women-s-circle at 390 px differs from the original: 20\.21% of its pixels changed, over the 15% limit\. Your page is 4222 px tall, the original 4108 px \(\+114 px\)\.\nSection differences:\n {2}multi-column sections: original 1, yours 2\n/
    )
    assert.match(
      finding!.message,
      /: \.pikku\/compare\/app\/women-s-circle-390\.diff\.png\n/
    )
  })

  test('a page the report has no row for is not a pass: it throws', () => {
    assert.throws(
      () =>
        pageFindings({
          report: realReport(),
          needs: [need('reviews'), need('reviews', 390)],
          threshold: 40,
          diffDir: '.pikku/compare/app',
        }),
      /no row for \/reviews @390/
    )
  })

  test('a report that is not JSON or not a compare report throws', () => {
    assert.throws(
      () => readCompareReport('{"rows": [ {"id": "x", "wid'),
      /JSON/
    )
    assert.throws(() => readCompareReport('[]'), /not a JSON object/)
    assert.throws(() => readCompareReport('{"generatedAt": "x"}'), /no rows/)
    assert.throws(() => readCompareReport('{"rows": []}'), /no generatedAt/)
    assert.throws(
      () =>
        readCompareReport(
          JSON.stringify({
            generatedAt: 'x',
            rows: [
              {
                id: 'a',
                width: 1440,
                path: '/a',
                status: 'compared',
                changedPercent: null,
              },
            ],
          })
        ),
      /row 0 is not a compare row/
    )
  })

  test('pages photographed with uncommitted changes are a finding', () => {
    const report = { ...realReport(), dirty: true }
    const [finding] = pageFindings({
      report,
      needs: [need('reviews')],
      threshold: 40,
      diffDir: 'd',
    })
    assert.equal(finding!.severity, 'high')
    assert.match(finding!.message, /photographed with uncommitted changes/)
  })

  test('a waiver covers a phone width only, as a note; a desktop width is never waived; a short reason does not count', () => {
    const { waivers, notes } = readWaivers({
      waivers: [
        { page: 'events', reason: REASON },
        { page: '/about', reason: 'too hard' },
      ],
    })
    assert.deepEqual(waivers, [{ page: '/events', reason: REASON }])
    assert.equal(notes.length, 1)
    assert.equal(notes[0]!.severity, 'low')
    assert.match(
      notes[0]!.message,
      /for \/about does not count: it needs a page and a reason of at least 30 characters/
    )
    const report = realReport()
    report.rows.push({ ...report.rows[0]!, width: 390 })
    const findings = pageFindings({
      report,
      needs: [need('events'), need('events', 390)],
      threshold: 40,
      diffDir: 'd',
      waivers,
    })
    assert.deepEqual(
      findings.map((f) => f.severity),
      ['high', 'low']
    )
    assert.match(
      findings[0]!.message,
      /The waiver for \/events does not cover it: a width of 1000 px or more is never waived\./
    )
    assert.equal(
      findings[1]!.message,
      `Page compare waived for /events @390: ${REASON}`
    )
    assert.equal(findings[1]!.rule, 'harness/page-compare-waived')
  })
})

/** Four route files, and a capture of `/` and `/about` at 1440 and 390 px with their style.json. */
const PROJECT = (settings?: object): Record<string, string> => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
    'pikku.config.json': JSON.stringify({
      frontends: { app: { cwd: 'apps/app' } },
    }),
    ...(settings
      ? { 'artifacts/pages-compare.json': JSON.stringify(settings) }
      : {}),
    'apps/app/src/routes/__root.tsx':
      'export const Route = createRootRoute({})\n',
    'apps/app/src/routes/index.tsx':
      "export const Route = createFileRoute('/')({})\n",
    'apps/app/src/routes/about.tsx':
      "export const Route = createFileRoute('/about')({})\n",
    'apps/app/src/routes/contact.tsx':
      "export const Route = createFileRoute('/contact')({})\n",
  }
  for (const id of ['index', 'about'])
    for (const width of [1440, 390]) {
      files[`artifacts/references/example.com/${id}-${width}.jpg`] =
        `the original ${id} at ${width}\n`
      files[`artifacts/references/example.com/${id}-${width}.style.json`] =
        '{}\n'
    }
  return files
}

/** A clone project (unless `files` says otherwise) on a changeset branch, with `changes` filed and claimed on its local queue. */
const setup = async (
  changes: { title: string; body?: string }[],
  {
    files = PROJECT(),
    scenario = {},
  }: { files?: Record<string, string>; scenario?: object } = {}
) => {
  const repo = await throwawayRepo(files)
  const store = join(repo, '.git', 'pikku-changes.json')
  const rpc = localChangesRPC(store)
  const filed = []
  for (const change of changes)
    filed.push(
      (
        await rpc.invoke('createChange', {
          projectId: 'local',
          ...change,
        } as never)
      ).change
    )
  const { group } = await rpc.invoke('claimChanges', {
    projectId: 'local',
    changeIds: filed.map((c) => c.changeId),
    claimedBy: 'test',
  } as never)
  const git = gitIn(repo)
  const base = (await git(['rev-parse', 'HEAD'])).trim()
  await git(['checkout', '-q', '-b', 'changeset/1'])
  const log = join(repo, '.git', 'fake-compare.log')
  const scenarioFile = join(repo, '.git', 'fake-compare.json')
  const setScenario = (value: object) =>
    writeFile(scenarioFile, JSON.stringify({ log, ...value }))
  await setScenario(scenario)
  const commit = async (
    written: Record<string, string>,
    subject = 'feat: #1 pages'
  ) => {
    for (const [path, content] of Object.entries(written)) {
      await mkdir(dirname(join(repo, path)), { recursive: true })
      await writeFile(join(repo, path), content)
    }
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', subject])
  }
  const items = filed.map((c) => ({
    shortId: String(c.shortId),
    changeId: c.changeId,
  }))
  const gate = (binary: string | null = FAKE_COMPARE) =>
    pagesGate({
      binary: binary ?? undefined,
      changeset: group.groupId,
      items,
      storePath: store,
      env: { FAKE_COMPARE: scenarioFile },
    })
  const wire = createGateWire({
    worktree: repo,
    base,
    attempt: 1,
    changeId: filed.at(-1)!.changeId,
    scratch: join(repo, '.git'),
  })
  const calls = async () =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            args: string[]
            parallel: string | null
            cwd: string
          }
      )
  return { repo, base, git, commit, gate, wire, calls, setScenario }
}

const HOME = {
  title: 'Build the home page',
  body: 'Rebuild the home page of the original.\n\nPages: /',
}
const infra = (kind: string, message: RegExp) => (error: unknown) =>
  error instanceof HarnessInfraError &&
  error.kind === kind &&
  message.test(error.message)

describe('pagesGate', () => {
  test('a changeset with no pages passes without running anything, even without a CLI', async () => {
    const h = await setup([
      {
        title: 'Add an endpoint',
        body: 'Return the list of members from the database.',
      },
    ])
    assert.deepEqual(await h.gate(null).run(h.wire), [])
    assert.deepEqual(await h.gate().run(h.wire), [])
    assert.deepEqual(await h.calls(), [])
  })

  test('a project that is not a clone at the base commit passes without running anything', async () => {
    const files = Object.fromEntries(
      Object.entries(PROJECT()).filter(
        ([path]) => !path.startsWith('artifacts/')
      )
    )
    const h = await setup([HOME], { files })
    // a capture the builder adds does not make it one
    await h.commit({
      'artifacts/references/example.com/index-1440.jpg': 'mine\n',
    })
    assert.deepEqual(await h.gate().run(h.wire), [])
    assert.deepEqual(await h.calls(), [])
  })

  test('a page over the threshold comes back with its numbers and the diff image in the worktree; the compare runs in the worktree with its own servers and writes under .pikku/compare', async () => {
    const h = await setup([HOME], {
      scenario: {
        rows: {
          'index-1440': {
            changedPercent: 62.5,
            styles: [
              {
                what: 'h1',
                text: 'h1: original 56px 700 #ae1a2c left; yours 48px 700 #ae1a2c left',
                weight: 0.33,
              },
            ],
            sections: {
              match: 0.5,
              notes: [
                'page height: original 3000 px, yours 2400 px (0.8x): content missing or too compact',
              ],
            },
          },
        },
      },
    })
    // where the browser is reaches the compare; nothing else of the harness's environment does
    process.env.PLAYWRIGHT_CHROMIUM_PATH = '/opt/chromium/headless_shell'
    const findings = await h
      .gate()
      .run(h.wire)
      .finally(() => delete process.env.PLAYWRIGHT_CHROMIUM_PATH)
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.severity, 'high')
    assert.match(
      findings[0]!.message,
      /^\/ at 1440 px differs from the original: 62\.5% of its pixels changed, over the 40% limit\. Your page is 2400 px tall, the original 3000 px \(-600 px\)\./
    )
    assert.match(findings[0]!.message, /\n {2}h1: original 56px 700/)
    assert.match(findings[0]!.message, /\n {2}page height: original 3000 px/)
    assert.match(
      findings[0]!.message,
      /: \.pikku\/compare\/app\/index-1440\.diff\.png\n/
    )
    assert.ok(
      existsSync(join(h.repo, '.pikku/compare/app/index-1440.diff.png'))
    )
    const [call, ...more] = await h.calls()
    assert.equal(more.length, 0)
    assert.deepEqual(call!.args, [
      'ui',
      'pages',
      'compare',
      '--reference',
      join(h.repo, 'artifacts/references/example.com'),
      '--app',
      'apps/app',
      '--page',
      'index',
      '--out',
      join(h.repo, '.pikku/compare/app'),
    ])
    assert.equal(call!.parallel, '1')
    assert.equal(call!.chromium, '/opt/chromium/headless_shell')
    assert.equal(call!.cwd, h.repo)
  })

  test('the threshold and the waivers are the base commit’s: settings the builder commits change nothing', async () => {
    const h = await setup([HOME], {
      files: PROJECT({ threshold: 50 }),
      scenario: { rows: { 'index-1440': 60 } },
    })
    await h.commit({
      'artifacts/pages-compare.json': JSON.stringify({
        threshold: 99,
        waivers: [{ page: '/', reason: REASON }],
      }),
    })
    const findings = await h.gate().run(h.wire)
    assert.equal(findings.length, 1)
    assert.match(
      findings[0]!.message,
      /60% of its pixels changed, over the 50% limit/
    )
    assert.doesNotMatch(findings[0]!.message, /waiver/)
    await h.setScenario({ rows: { 'index-1440': 45 } })
    assert.deepEqual(await h.gate().run(h.wire), [])
  })

  test('the widths are the base commit’s too', async () => {
    const h = await setup([HOME], { files: PROJECT({ widths: [1440] }) })
    assert.deepEqual(await h.gate().run(h.wire), [])
    const [call] = await h.calls()
    assert.deepEqual(call!.args.slice(-4), [
      '--widths',
      '1440',
      '--out',
      join(h.repo, '.pikku/compare/app'),
    ])
  })

  test('a waiver on the base commit lets a phone width through as a note; the desktop width is still held', async () => {
    const h = await setup([HOME], {
      files: PROJECT({
        waivers: [
          { page: '/', reason: REASON },
          { page: '/about', reason: 'short' },
        ],
      }),
      scenario: { rows: { 'index-390': 70, 'index-1440': 70 } },
    })
    const findings = await h.gate().run(h.wire)
    assert.deepEqual(
      findings.map((f) => [f.severity, f.rule]),
      [
        ['low', 'harness/page-compare-waived'],
        ['high', 'harness/page-compare'],
        ['low', 'harness/page-compare-waived'],
      ]
    )
    assert.match(
      findings[0]!.message,
      /waiver in artifacts\/pages-compare\.json for \/about does not count/
    )
    assert.match(
      findings[1]!.message,
      /^\/ at 1440 px .*The waiver for \/ does not cover it: a width of 1000 px or more is never waived\./
    )
    assert.equal(
      findings[2]!.message,
      `Page compare waived for / @390: ${REASON}`
    )
  })

  test('a page that is the original’s screenshot fails before any compare', async () => {
    const h = await setup([HOME])
    await h.commit({
      'apps/app/public/hero.jpg': 'the original index at 1440\n',
    })
    const [finding, ...rest] = await h.gate().run(h.wire)
    assert.equal(rest.length, 0)
    assert.equal(finding!.severity, 'high')
    assert.match(
      finding!.message,
      /shows the original's screenshots as its pages:\n {2}apps\/app\/public\/hero\.jpg is a copy of the original's screenshot index-1440\.jpg\n/
    )
    assert.match(
      finding!.message,
      /The screenshots are the answer key, not material\./
    )
    assert.deepEqual(await h.calls(), [])
  })

  test('a changed capture fails before any compare', async () => {
    const h = await setup([HOME])
    await h.commit({
      'artifacts/references/example.com/index-1440.jpg':
        'a screenshot of my page\n',
    })
    const [finding] = await h.gate().run(h.wire)
    assert.match(
      finding!.message,
      /changes the capture of the original \(artifacts\/references\/example\.com\/index-1440\.jpg\)/
    )
    assert.deepEqual(await h.calls(), [])
  })

  test('new pages are not compared but must exist', async () => {
    const h = await setup([
      {
        title: 'Build the contact page',
        body: 'A contact form.\n\nNew pages (no original): /contact',
      },
    ])
    assert.deepEqual(await h.gate().run(h.wire), [])
    assert.deepEqual(await h.calls(), [])
    const g = await setup([
      {
        title: 'Build the team page',
        body: 'The team.\n\nNew pages (no original): /team',
      },
    ])
    const [finding] = await g.gate().run(g.wire)
    assert.match(
      finding!.message,
      /declares \/team as a new page \(no original to compare with\), and the frontend has no route for it/
    )
    assert.deepEqual(await g.calls(), [])
  })

  test('a page the capture does not have, a missing page and a change with too many pages are findings', async () => {
    const h = await setup([
      { title: 'Contact', body: 'x y z.\n\nPages: /contact' },
    ])
    const [none] = await h.gate().run(h.wire)
    assert.match(
      none!.message,
      /names pages that have no screenshot in the capture of the original: \/contact\. .*The capture has: \/, \/about\./
    )
    const m = await setup(
      [{ title: 'About', body: 'x y z.\n\nPages: /about' }],
      { scenario: { rows: { 'about-1440': { status: 'missing' } } } }
    )
    const [missing] = await m.gate().run(m.wire)
    assert.match(
      missing!.message,
      /^MISSING \/about at 1440 px: the compare found no page at \/about \(it answered 404\)/
    )
    const t = await setup([
      { title: 'Many', body: 'x y z.\n\nPages: /, /a, /b, /c, /d, /e' },
    ])
    const [many] = await t.gate().run(t.wire)
    assert.match(many!.message, /^#1 names 6 pages .* at most 5/)
    assert.deepEqual(await t.calls(), [])
  })

  test('a frontend change with no Pages line is held to the pages it touched, and one that touched none is a finding', async () => {
    const h = await setup([
      {
        title: 'Restyle the home page',
        body: 'Make the home page layout match the original.',
      },
    ])
    const [none] = await h.gate().run(h.wire)
    assert.match(
      none!.message,
      /names no pages \(no `Pages:` line in its body\) and it touched no page or route file/
    )
    await h.commit({
      'apps/app/src/routes/index.tsx':
        "export const Route = createFileRoute('/')({ component: Home })\n",
    })
    assert.deepEqual(await h.gate().run(h.wire), [])
    assert.deepEqual((await h.calls())[0]!.args.slice(7, 9), [
      '--page',
      'index',
    ])
  })

  test('it fails closed: no CLI, no report, a garbled report, a row missing, a stale report or a failed compare is infra, never a pass', async () => {
    const h = await setup([HOME])
    await assert.rejects(
      h.gate(null).run(h.wire),
      infra('missing-binary', /PIKKU_CLI_BIN/)
    )
    for (const [mode, kind, message] of [
      [
        'none',
        'unparseable',
        /wrote no report at \.pikku\/compare\/app\/report\.json/,
      ],
      [
        'garbled',
        'unparseable',
        /report\.json cannot be read as a compare of \/ @1440, \/ @390: .*JSON/,
      ],
      ['drop', 'unparseable', /has no row for \/ @390/],
      ['stale', 'unparseable', /before this compare started/],
      ['exit', 'exit-code', /exited 1 and reported nothing\n.*port in use/],
    ] as const) {
      await h.setScenario({ mode })
      await assert.rejects(h.gate().run(h.wire), infra(kind, message), mode)
    }
  })

  test('it writes only under .pikku/compare; a compare that writes elsewhere is stopped by the write guard', async () => {
    const h = await setup([HOME])
    const gate = h.gate()
    let before = await snapshotTree(h.repo)
    await gate.run(h.wire)
    const changed = await guardWrites({
      worktree: h.repo,
      before,
      writes: gate.writes,
      gate: gate.name,
    })
    assert.ok(changed.length > 0)
    assert.ok(
      changed.every((path) => path.startsWith('.pikku/compare/app/')),
      changed.join(', ')
    )
    assert.ok(!existsSync(join(h.repo, 'artifacts/compare')))
    await h.setScenario({ mode: 'stray' })
    before = await snapshotTree(h.repo)
    await gate.run(h.wire)
    await assert.rejects(
      guardWrites({
        worktree: h.repo,
        before,
        writes: gate.writes,
        gate: gate.name,
      }),
      infra(
        'write-outside-allowlist',
        /Gate pages changed 1 path\(s\) outside \.pikku\/compare\/\*\*: stray\.txt/
      )
    )
  })

  test('a reference that is not a capture stops the run for a person to fix', async () => {
    const files = PROJECT()
    for (const path of Object.keys(files))
      if (path.endsWith('.style.json')) delete files[path]
    const h = await setup([HOME], { files })
    await assert.rejects(
      h.gate().run(h.wire),
      infra('precondition', /was not made by pikku ui pages capture/)
    )
  })
})
