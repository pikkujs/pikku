import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  checkPageGate,
  refuseUntilPagesCompared,
  touchedFiles,
  type Git,
} from './page-gate.js'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** A workspace with one frontend (/, /about, /contact) and a reference for / and /about at 1440 and 390. */
const project = ({
  reference = true,
  config = {},
}: { reference?: boolean; config?: Record<string, unknown> } = {}) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pikku-page-gate-')))
  write(join(dir, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }))
  write(
    join(dir, 'pikku.config.json'),
    JSON.stringify({ frontends: { app: { cwd: 'apps/app' } }, ...config })
  )
  const routes = join(dir, 'apps', 'app', 'src', 'routes')
  write(join(routes, '__root.tsx'), 'export const Route = createRootRoute({})')
  write(
    join(routes, 'index.tsx'),
    "export const Route = createFileRoute('/')({})"
  )
  write(
    join(routes, 'about.tsx'),
    "export const Route = createFileRoute('/about')({})"
  )
  write(
    join(routes, 'contact.tsx'),
    "export const Route = createFileRoute('/contact')({})"
  )
  if (reference)
    for (const name of [
      'index-1440.jpg',
      'index-390.jpg',
      'about-1440.jpg',
      'about-390.jpg',
    ])
      write(join(dir, 'artifacts', 'references', 'example.com', name), 'x')
  return dir
}

/** git answering from a table; anything not in it fails, as an unknown ref would. */
const fakeGit =
  (top: string, touched: string[], extra: Record<string, string> = {}): Git =>
  async (args) => {
    const table: Record<string, string> = {
      'rev-parse --show-toplevel': top,
      'rev-parse HEAD': HEAD,
      'rev-parse --abbrev-ref HEAD': 'changeset/pages',
      'for-each-ref --format=%(refname:short) refs/heads':
        'main\nchangeset/pages',
      'merge-base HEAD main': BASE,
      [`rev-list --count ${BASE}..HEAD`]: '2',
      [`diff --name-only ${BASE} HEAD`]: touched.join('\n'),
      ...extra,
    }
    const out = table[args.join(' ')]
    if (out === undefined) throw new Error(`unexpected git ${args.join(' ')}`)
    return out
  }

const row = (
  id: string,
  width: number,
  changedPercent: number | null,
  status = 'compared'
) => ({
  id,
  width,
  path: id === 'index' ? '/' : `/${id}`,
  status,
  changedPercent,
  referenceHeight: 3000,
  ourHeight: 2400,
  heightDiff: -600,
  httpStatus: 200,
  diff: `${id}-${width}.diff.png`,
  ours: `${id}-${width}.png`,
  sections: null,
})

const report = (dir: string, body: Record<string, unknown>) =>
  write(
    join(dir, '.pikku', 'pages', 'compare', 'app', 'report.json'),
    JSON.stringify({
      reference: 'artifacts/references/example.com',
      gitSha: HEAD,
      dirty: false,
      generatedAt: '2026-11-16T10:00:00.000Z',
      ...body,
    })
  )

const ABOUT = ['apps/app/src/routes/about.tsx']
const allAbout = [row('about', 1440, 12), row('about', 390, 30)]

describe('the page gate on changes done', () => {
  test('passes when a fresh report covers every touched page at every width within the threshold', async () => {
    const dir = project()
    report(dir, { rows: [...allAbout, row('index', 1440, 90)] })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.deepStrictEqual(outcome, { kind: 'pass', pages: ['/about'] })
  })

  test('refuses with the pages to compare and the command when there is no report', async () => {
    const dir = project()
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
      label: '#7',
    })
    assert.strictEqual(outcome.kind, 'refuse')
    const message = (outcome as { message: string }).message
    assert.match(
      message,
      /^#7 touched pages that have a reference screenshot \(\/about\)/
    )
    assert.match(message, /There is no compare report yet/)
    assert.match(message, /about @1440, about @390/)
    assert.match(
      message,
      /pikku ui pages compare --reference artifacts\/references\/example\.com --page about/
    )
    assert.match(message, /--waive/)
  })

  test('refuses a report taken at an older commit, showing its old numbers', async () => {
    const dir = project()
    report(dir, {
      gitSha: 'c'.repeat(40),
      rows: [row('about', 1440, 55), row('about', 390, 20)],
    })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    const message = (outcome as { message: string }).message
    assert.match(message, /is stale: it was taken at ccccccc .*HEAD is aaaaaaa/)
    assert.match(message, /about @1440 \(\/about\): 55% of pixels differ/)
  })

  test('refuses a report taken at HEAD with uncommitted frontend changes', async () => {
    const dir = project()
    report(dir, { dirty: true, rows: allAbout })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /uncommitted changes in apps\/app/
    )
  })

  test('refuses a MISSING page and a width with no report entry', async () => {
    const dir = project()
    report(dir, { rows: [row('about', 1440, null, 'missing')] })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    const message = (outcome as { message: string }).message
    assert.match(
      message,
      /MISSING about @1440: the compare found no page at \/about/
    )
    assert.match(message, /No report entry for: about @390/)
  })

  test('refuses pages over the threshold, worst first, with the diff image', async () => {
    const dir = project()
    report(dir, { rows: [row('about', 1440, 41.5), row('about', 390, 70)] })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    const message = (outcome as { message: string }).message
    assert.match(message, /Over the 40% limit, worst first:/)
    assert.ok(message.indexOf('about @390') < message.indexOf('about @1440'))
    assert.match(
      message,
      /70% of pixels differ, height 2400 px vs 3000 px in the original\. Diff: \.pikku\/pages\/compare\/app\/about-390\.diff\.png/
    )
  })

  test('takes the threshold from pagesCompare.threshold', async () => {
    const dir = project({ config: { pagesCompare: { threshold: 10 } } })
    report(dir, { rows: allAbout })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match((outcome as { message: string }).message, /Over the 10% limit/)
  })

  test('a layout or __root change touches every page under it', async () => {
    const dir = project()
    const outcome = await checkPageGate({
      git: fakeGit(dir, ['apps/app/src/routes/__root.tsx']),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /--page index,about|--page about,index/
    )
  })

  test('--waive with a reason lets it through and is recorded for the note', async () => {
    const dir = project()
    const result = await refuseUntilPagesCompared({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
      waive: '  the about page embeds a live Instagram feed  ',
    })
    assert.strictEqual(result.outcome.kind, 'waived')
    assert.strictEqual(
      result.note,
      'Page compare waived for /about: the about page embeds a live Instagram feed'
    )
  })

  test('--waive with a reason under 10 characters is refused', async () => {
    const dir = project()
    await assert.rejects(
      refuseUntilPagesCompared({
        git: fakeGit(dir, ABOUT),
        cwd: dir,
        env: {},
        waive: 'nope',
      }),
      /--waive needs a reason of at least 10 characters/
    )
  })

  test('a project with no reference is untouched', async () => {
    const dir = project({ reference: false })
    assert.deepStrictEqual(
      await checkPageGate({ git: fakeGit(dir, ABOUT), cwd: dir, env: {} }),
      { kind: 'skip', why: 'no reference under artifacts/references' }
    )
  })

  test('a change that touched no page file is untouched', async () => {
    const dir = project()
    const outcome = await checkPageGate({
      git: fakeGit(dir, [
        'packages/functions/src/newsletter.ts',
        'apps/app/src/lib/api.ts',
      ]),
      cwd: dir,
      env: {},
    })
    assert.deepStrictEqual(outcome, {
      kind: 'skip',
      why: 'no page file touched since main',
    })
  })

  test('a touched page with no reference screenshot is untouched', async () => {
    const dir = project()
    const outcome = await checkPageGate({
      git: fakeGit(dir, ['apps/app/src/routes/contact.tsx']),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'skip')
  })

  test('PIKKU_COMPARE_GATE=off turns it off', async () => {
    const dir = project()
    assert.deepStrictEqual(
      await checkPageGate({
        git: fakeGit(dir, ABOUT),
        cwd: dir,
        env: { PIKKU_COMPARE_GATE: 'off' },
      }),
      { kind: 'off' }
    )
  })
})

describe('touchedFiles', () => {
  test('diffs against the nearest branch point, skipping branches that contain HEAD', async () => {
    const near = 'd'.repeat(40)
    const git = fakeGit('/x', [], {
      'for-each-ref --format=%(refname:short) refs/heads':
        'main\nchangeset/earlier\nchangeset/later\nchangeset/pages',
      'merge-base HEAD changeset/earlier': near,
      [`rev-list --count ${near}..HEAD`]: '1',
      'merge-base HEAD changeset/later': HEAD,
      [`diff --name-only ${near} HEAD`]: 'a.ts\nb.ts',
    })
    assert.deepStrictEqual(await touchedFiles(git), {
      base: 'changeset/earlier',
      files: ['a.ts', 'b.ts'],
    })
  })

  test('with no other branch, the files of the HEAD commit', async () => {
    const git = fakeGit('/x', [], {
      'for-each-ref --format=%(refname:short) refs/heads': 'changeset/pages',
      'diff-tree --root --no-commit-id --name-only -r HEAD': 'c.ts',
    })
    assert.deepStrictEqual(await touchedFiles(git), {
      base: null,
      files: ['c.ts'],
    })
  })
})
