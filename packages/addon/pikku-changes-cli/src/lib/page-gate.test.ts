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
    ]) {
      write(join(dir, 'artifacts', 'references', 'example.com', name), 'x')
      write(
        join(
          dir,
          'artifacts',
          'references',
          'example.com',
          name.replace('.jpg', '.style.json')
        ),
        '{}'
      )
    }
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

const report = (
  dir: string,
  body: Record<string, unknown>,
  where = join('artifacts', 'tmp', 'compare', 'app')
) =>
  write(
    join(dir, where, 'report.json'),
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
      /70% of pixels differ, height 2400 px vs 3000 px in the original\. Diff: artifacts\/tmp\/compare\/app\/about-390\.diff\.png/
    )
  })

  test('still reads a report in the old .pikku location; the newest report wins', async () => {
    const dir = project()
    const old = join('.pikku', 'pages', 'compare', 'app')
    report(dir, { rows: allAbout }, old)
    assert.strictEqual(
      (await checkPageGate({ git: fakeGit(dir, ABOUT), cwd: dir, env: {} }))
        .kind,
      'pass'
    )
    report(dir, {
      generatedAt: '2026-11-16T11:00:00.000Z',
      rows: [row('about', 1440, 80), row('about', 390, 30)],
    })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /80% of pixels differ/
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

  test('--waive lets a phone width over the limit through, and is recorded for the note', async () => {
    const dir = project()
    report(dir, { rows: [row('about', 1440, 12), row('about', 390, 70)] })
    const result = await refuseUntilPagesCompared({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
      waive: '  the about page embeds a live Instagram feed on phones  ',
    })
    assert.strictEqual(result.outcome.kind, 'waived')
    assert.strictEqual(
      result.note,
      'Page compare waived for /about @390: the about page embeds a live Instagram feed on phones'
    )
  })

  test('--waive is refused when a desktop width is over the limit, with its numbers and style differences', async () => {
    const dir = project()
    report(dir, {
      rows: [
        {
          ...row('about', 1440, 55),
          styles: [
            {
              what: 'h1',
              text: 'h1: original 56px 700 #a3132f center; yours 40px 300 #111111 left',
              weight: 2,
            },
            {
              what: 'page background',
              text: 'page background: original #ffffff; yours #fdf3f1',
              weight: 1,
            },
          ],
        },
        row('about', 390, 70),
      ],
    })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
      waive: 'the original phone page is the desktop page scaled down',
    })
    assert.strictEqual(outcome.kind, 'refuse')
    const message = (outcome as { message: string }).message
    assert.match(
      message,
      /^--waive refused: a waiver covers only phone widths \(under 1000 px\)/
    )
    assert.match(message, /about @1440 \(\/about\): 55% of pixels differ/)
    assert.match(
      message,
      /style {2}h1: original 56px 700 #a3132f center; yours 40px 300 #111111 left/
    )
    assert.match(
      message,
      /style {2}page background: original #ffffff; yours #fdf3f1/
    )
  })

  test('--waive is refused when there is no report to show the desktop widths', async () => {
    const dir = project()
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
      waive: 'the about page embeds a live Instagram feed on phones',
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /There is no compare report yet/
    )
  })

  test('--waive with a reason under 30 characters is refused', async () => {
    const dir = project()
    await assert.rejects(
      refuseUntilPagesCompared({
        git: fakeGit(dir, ABOUT),
        cwd: dir,
        env: {},
        waive: 'the phone page differs',
      }),
      /--waive needs a reason of at least 30 characters/
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

  test('a clone with archaeology notes and no capture is refused with the capture command', async () => {
    const dir = project({ reference: false })
    write(
      join(dir, 'knowledge', 'site', 'index.md'),
      'Pages of https://www.example.com/ (crawled):\n- / home\n'
    )
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
      label: '#3',
    })
    assert.strictEqual(outcome.kind, 'refuse')
    const message = (outcome as { message: string }).message
    assert.match(message, /^#3 touched pages of a site rebuilt/)
    assert.match(message, /There is no capture of the original/)
    assert.match(
      message,
      /Run: pikku ui pages capture https:\/\/www\.example\.com\/ --out artifacts\/references\/<site>/
    )
  })

  test('a reference written by hand in viewport folders is refused: no style.json, so capture it again', async () => {
    const dir = project({ reference: false })
    const ref = join(dir, 'artifacts', 'references', 'www.example.com')
    // a 1440 x 10 PNG header is all the reader needs for the width
    const png = Buffer.alloc(33)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    png.writeUInt32BE(1440, 16)
    png.writeUInt32BE(10, 20)
    for (const name of ['index', 'about']) {
      write(join(ref, 'laptop', `${name}.png`), '')
      writeFileSync(join(ref, 'laptop', `${name}.png`), png)
    }
    write(join(ref, 'layout-notes.json'), '{}')
    write(join(ref, 'pages.txt'), 'https://www.example.com/\n')
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    const message = (outcome as { message: string }).message
    assert.match(message, /was not made by pikku ui pages capture/)
    assert.match(
      message,
      /Run: pikku ui pages capture https:\/\/www\.example\.com\/ --out artifacts\/references\/www\.example\.com/
    )
  })

  test('a capture whose pictures were not downloaded is refused; with them it goes on to the compare', async () => {
    const dir = project()
    const ref = join(dir, 'artifacts', 'references', 'example.com')
    write(
      join(ref, 'about.json'),
      JSON.stringify({
        id: 'about',
        url: 'https://example.com/about',
        pictures: [{ src: 'https://example.com/a.jpg', file: null }],
      })
    )
    const refused = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(refused.kind, 'refuse')
    assert.match(
      (refused as { message: string }).message,
      /none were downloaded into artifacts\/references\/example\.com\/pictures[\s\S]*Run: pikku ui pages capture https:\/\/example\.com\/ --out artifacts\/references\/example\.com/
    )
    write(join(ref, 'pictures', 'a-1234abcd.jpg'), 'x')
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /There is no compare report yet/
    )
  })

  test('a clone change that touched no page is untouched, even with no capture', async () => {
    const dir = project({ reference: false })
    write(join(dir, 'knowledge', 'site', 'index.md'), '- / home\n')
    assert.deepStrictEqual(
      await checkPageGate({
        git: fakeGit(dir, ['packages/functions/src/newsletter.ts']),
        cwd: dir,
        env: {},
      }),
      { kind: 'skip', why: 'no page file touched since main' }
    )
  })

  test('a change with declared pages is held to exactly those, whatever route file it touched', async () => {
    const dir = project()
    // one catch-all route renders every page: touching it touches all of them
    write(
      join(dir, 'apps', 'app', 'src', 'routes', '$slug.tsx'),
      "export const Route = createFileRoute('/$slug')({})"
    )
    const touched = ['apps/app/src/routes/$slug.tsx']
    report(dir, { rows: [row('about', 1440, 12), row('about', 390, 30)] })
    assert.deepStrictEqual(
      await checkPageGate({
        git: fakeGit(dir, touched),
        cwd: dir,
        env: {},
        pages: ['/about/'],
      }),
      { kind: 'pass', pages: ['/about'] }
    )
    // a declared page is compared even when no page file was touched; over the limit it is refused
    report(dir, { rows: [row('index', 1440, 72.6), row('index', 390, 30)] })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ['apps/app/src/lib/theme.ts']),
      cwd: dir,
      env: {},
      pages: ['index'],
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /index @1440 \(\/\): 72\.6% of pixels differ/
    )
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

describe('the page gate for a builder (PIKKU_CHANGES_BUILDER=1)', () => {
  const BUILDER = { PIKKU_CHANGES_BUILDER: '1' }
  /** A compare that writes the report a real run would, at HEAD, now. */
  const comparing =
    (rows: unknown[], calls: unknown[] = []) =>
    (args: { out: string; ids: string[] }) => {
      calls.push(args)
      write(
        join(args.out, 'report.json'),
        JSON.stringify({
          reference: 'artifacts/references/example.com',
          gitSha: HEAD,
          dirty: false,
          generatedAt: new Date().toISOString(),
          rows,
        })
      )
      return { code: 0, output: '' }
    }

  test('cannot turn the gate off', async () => {
    const dir = project()
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: { ...BUILDER, PIKKU_COMPARE_GATE: 'off' },
      compare: comparing(allAbout),
    })
    assert.deepStrictEqual(outcome, { kind: 'pass', pages: ['/about'] })
  })

  test('done runs the compare itself; a report written by hand is not read', async () => {
    const dir = project()
    // a forged report: at HEAD, clean, every page within the limit
    report(dir, {
      rows: [row('about', 1440, 1), row('about', 390, 1)],
      generatedAt: '2999-01-01T00:00:00.000Z',
    })
    const calls: Array<{ ids: string[] }> = []
    const outcome = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: BUILDER,
      compare: comparing([row('about', 1440, 64), row('about', 390, 1)], calls),
    })
    assert.deepStrictEqual(
      calls.map((c) => c.ids),
      [['about']]
    )
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match((outcome as { message: string }).message, /64% of pixels/)

    // a compare that writes nothing leaves a forged report (dated in the future) unread
    report(dir, {
      rows: [row('about', 1440, 1), row('about', 390, 1)],
      generatedAt: '2999-01-01T00:00:00.000Z',
    })
    const silent = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: BUILDER,
      compare: () => ({ code: 1, output: 'No browser found' }),
    })
    assert.strictEqual(silent.kind, 'refuse')
    assert.match(
      (silent as { message: string }).message,
      /wrote no report[\s\S]*No browser found/
    )
  })

  test("the threshold is the base branch's, not one raised in the worktree's own config", async () => {
    const dir = project({ config: { pagesCompare: { threshold: 95 } } })
    const run = comparing([row('about', 1440, 50), row('about', 390, 10)])
    const base = fakeGit(dir, ABOUT, {
      'show main:pikku.config.json': JSON.stringify({
        pagesCompare: { threshold: 30 },
      }),
    })
    const outcome = await checkPageGate({
      git: base,
      cwd: dir,
      env: BUILDER,
      compare: run,
    })
    assert.match((outcome as { message: string }).message, /Over the 30% limit/)
    // the operator's env wins over both
    assert.deepStrictEqual(
      await checkPageGate({
        git: base,
        cwd: dir,
        env: { ...BUILDER, PIKKU_COMPARE_THRESHOLD: '60' },
        compare: run,
      }),
      { kind: 'pass', pages: ['/about'] }
    )
    // with no threshold on the base branch, the default
    const outcome2 = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: BUILDER,
      compare: run,
    })
    assert.match(
      (outcome2 as { message: string }).message,
      /Over the 40% limit/
    )
  })
})

describe('a clone change that names its pages', () => {
  test('a named page with no screenshot of the original is refused, naming it', async () => {
    const dir = project()
    report(dir, { rows: allAbout })
    const outcome = await checkPageGate({
      git: fakeGit(dir, ['apps/app/src/lib/theme.ts']),
      cwd: dir,
      env: {},
      pages: ['/about', '/contact'],
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /no screenshot in the capture of the original: \/contact\.[\s\S]*The capture has: \/about, \//
    )
  })

  test('a frontend change with no Pages: line that touched no page or route file is refused', async () => {
    const dir = project()
    const outcome = await checkPageGate({
      git: fakeGit(dir, ['apps/app/src/components/Card.tsx']),
      cwd: dir,
      env: {},
      frontend: true,
    })
    assert.strictEqual(outcome.kind, 'refuse')
    assert.match(
      (outcome as { message: string }).message,
      /is a frontend change[\s\S]*names no pages[\s\S]*touched no page or route file/
    )
    // a build change that touched no page is still untouched
    assert.strictEqual(
      (
        await checkPageGate({
          git: fakeGit(dir, ['packages/functions/src/a.ts']),
          cwd: dir,
          env: {},
        })
      ).kind,
      'skip'
    )
  })

  test('a frontend change filed before the project was a clone (no Pages: line) is held to the pages it touched, not refused', async () => {
    const dir = project()
    report(dir, { rows: allAbout })
    assert.deepStrictEqual(
      await checkPageGate({
        git: fakeGit(dir, ABOUT),
        cwd: dir,
        env: {},
        frontend: true,
      }),
      { kind: 'pass', pages: ['/about'] }
    )
    // and a touched page over the limit still fails
    report(dir, { rows: [row('about', 1440, 80), row('about', 390, 1)] })
    const over = await checkPageGate({
      git: fakeGit(dir, ABOUT),
      cwd: dir,
      env: {},
      frontend: true,
    })
    assert.strictEqual(over.kind, 'refuse')
    assert.match((over as { message: string }).message, /Over the 40% limit/)
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
