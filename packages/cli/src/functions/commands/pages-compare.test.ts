import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import {
  compareShot,
  decodeImage,
  diffImages,
  encodePng,
  gitStamp,
  overThreshold,
  readReference,
  routeExists,
  routeFor,
  worstFirst,
  type CompareRow,
  type Rgba,
} from './pages-compare.js'

/** A white page with a grey header band and a dark block, `height` tall. */
const page = (
  width: number,
  height: number,
  block?: { x: number; y: number; size: number },
  header = 20
): Rgba => {
  const data = new Uint8Array(width * height * 4).fill(255)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (y < header) data.set([120, 120, 120, 255], o)
      if (
        block &&
        x >= block.x &&
        x < block.x + block.size &&
        y >= block.y &&
        y < block.y + block.size
      )
        data.set([20, 20, 20, 255], o)
    }
  return { width, height, data }
}

const row = (over: Partial<CompareRow>): CompareRow => ({
  id: 'x',
  width: 1440,
  path: '/x',
  status: 'compared',
  changedPercent: 0,
  referenceHeight: 100,
  ourHeight: 100,
  heightDiff: 0,
  httpStatus: 200,
  diff: null,
  ours: null,
  sections: null,
  ...over,
})

describe('pages compare', () => {
  test('identical pages change nothing', () => {
    const diff = diffImages(page(100, 200), page(100, 200))
    assert.equal(diff.changedPercent, 0)
    const out = decodeImage(diff.png)
    assert.equal(out.width, 100 * 3 + 12)
    assert.equal(out.height, 200)
  })

  test('a small difference is a small share', () => {
    const diff = diffImages(
      page(100, 200),
      page(100, 200, { x: 10, y: 50, size: 20 })
    )
    assert.equal(diff.changedPercent, 2) // 400 of 20000 pixels
  })

  test('a JPEG reference against a PNG of ours, at twice the width', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pages-compare-'))
    const ref = page(100, 200)
    writeFileSync(
      join(dir, 'about-100.jpg'),
      jpeg.encode({ ...ref, data: Buffer.from(ref.data) }, 90).data
    )
    const [shot] = readReference(dir)
    const ours = encodePng(page(200, 400, undefined, 40))
    const { diff, referenceHeight, ourHeight, ourImageWidth } = compareShot(
      shot!,
      ours
    )
    assert.equal(diff.width, 100)
    assert.equal(diff.changedPercent, 0)
    assert.equal(referenceHeight, 200)
    assert.equal(ourHeight, 400) // pixel heights, as taken
    assert.equal(ourImageWidth, 200)
  })

  test('a much taller page counts the part the reference lacks as changed, and does not crash', () => {
    const diff = diffImages(page(100, 200), page(100, 1000))
    assert.equal(diff.changedPercent, 80)
    assert.equal(decodeImage(diff.png).height, 1000)
    const shorter = diffImages(page(100, 1000), page(100, 10))
    assert.equal(shorter.changedPercent, 99) // 990 of 1000 rows have no counterpart
  })

  test('reads the reference folder: ids, widths, layout files; skips diff images and others', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pages-compare-'))
    for (const name of [
      'index-1440.jpg',
      'index-1440.layout.json',
      'index-390.png',
      'blog__post-1440.jpeg',
      'index-1440.diff.png',
      'index.json',
      'notes.txt',
    ])
      writeFileSync(join(dir, name), '')
    assert.deepEqual(
      readReference(dir).map((s) => [s.id, s.width, !!s.layout]),
      [
        ['blog__post', 1440, false],
        ['index', 1440, true],
        ['index', 390, false],
      ]
    )
    assert.throws(() => readReference(join(dir, 'nope')), /does not exist/)
  })

  test('maps reference ids to routes and reports a page with no route as missing', () => {
    const routes = ['/', '/about', '/events/$slug', '/docs/$']
    assert.equal(routeFor('index'), '/')
    assert.equal(routeFor('about'), '/about')
    assert.equal(routeFor('blog__post'), '/blog/post')
    assert.equal(routeFor('about-us', { 'about-us': '/about' }), '/about')
    assert.ok(routeExists(routeFor('index'), routes))
    assert.ok(routeExists('/about/', routes))
    assert.ok(routeExists('/events/full-moon', routes))
    assert.ok(routeExists('/docs/a/b', routes))
    assert.ok(!routeExists(routeFor('beforeyoudie'), routes))
    assert.ok(!routeExists('/events', routes))
  })

  test('sorts worst first and applies the threshold, a missing page always failing it', () => {
    const rows = [
      row({ id: 'a', changedPercent: 5 }),
      row({ id: 'gone', status: 'missing', changedPercent: null }),
      row({ id: 'b', changedPercent: 40 }),
    ]
    assert.deepEqual(
      worstFirst(rows).map((r) => r.id),
      ['gone', 'b', 'a']
    )
    assert.deepEqual(
      overThreshold(rows, 10).map((r) => r.id),
      ['gone', 'b']
    )
    assert.deepEqual(overThreshold(rows), [])
  })
})

describe('gitStamp', () => {
  test('records HEAD and whether the frontend has uncommitted changes', async () => {
    const calls: string[] = []
    const run = async (args: string[]) => {
      calls.push(args.join(' '))
      return args[0] === 'rev-parse' ? 'abc123\n' : ' M src/routes/index.tsx\n'
    }
    assert.deepEqual(await gitStamp('/app', run), {
      gitSha: 'abc123',
      dirty: true,
    })
    assert.deepEqual(calls, ['rev-parse HEAD', 'status --porcelain -- .'])
    assert.deepEqual(
      await gitStamp('/app', async (args) =>
        args[0] === 'rev-parse' ? 'abc123' : ''
      ),
      { gitSha: 'abc123', dirty: false }
    )
  })

  test('is null outside a git checkout', async () => {
    assert.deepEqual(
      await gitStamp('/app', async () => {
        throw new Error('not a git repository')
      }),
      { gitSha: null, dirty: null }
    )
  })
})
