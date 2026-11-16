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
  fontName,
  styleDiff,
  toHex,
  worstFirst,
  type StyleSummary,
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
      'index-1440.style.json',
      'index-390.png',
      'blog__post-1440.jpeg',
      'index-1440.diff.png',
      'index.json',
      'notes.txt',
    ])
      writeFileSync(join(dir, name), '')
    assert.deepEqual(
      readReference(dir).map((s) => [s.id, s.width, !!s.layout, !!s.style]),
      [
        ['blog__post', 1440, false, false],
        ['index', 1440, true, true],
        ['index', 390, false, false],
      ]
    )
    assert.throws(() => readReference(join(dir, 'nope')), /does not exist/)
  })

  test('maps reference ids to routes and reports a page with no route as missing', () => {
    const routes = ['/', '/about', '/events/$slug', '/docs/$']
    assert.equal(routeFor('index'), '/')
    assert.equal(routeFor('home'), '/')
    assert.equal(routeFor('home', { home: '/start' }), '/start')
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

  test('normalises colours to hex: rgb, rgba over white, short hex', () => {
    assert.equal(toHex('rgb(163, 19, 47)'), '#a3132f')
    assert.equal(toHex('rgba(0, 0, 0, 0)'), '#ffffff')
    assert.equal(toHex('rgba(0, 0, 0, 0.5)'), '#808080')
    assert.equal(toHex('rgb(17 17 17 / 100%)'), '#111111')
    assert.equal(toHex('#FFF'), '#ffffff')
    assert.equal(toHex(null), null)
  })

  test('reports the style differences that matter, worst first, in plain words', () => {
    const el = (over: Partial<StyleSummary['elements'] & object> = {}) => over
    const ref: StyleSummary = {
      pageBackground: 'rgb(255, 255, 255)',
      header: { height: 120, background: 'rgb(255, 255, 255)' },
      contentWidth: 980,
      elements: el({
        h1: {
          size: 56,
          weight: 700,
          color: 'rgb(163, 19, 47)',
          align: 'center',
          family: 'playfair display',
          background: 'rgb(255, 255, 255)',
        },
        h2: {
          size: 32,
          weight: 400,
          color: 'rgb(17, 17, 17)',
          align: 'left',
          family: 'lato',
        },
        p: {
          size: 16,
          weight: 400,
          color: 'rgb(51, 51, 51)',
          align: 'left',
          family: 'lato',
        },
      }),
    }
    const mine: StyleSummary = {
      pageBackground: 'rgb(253, 243, 241)',
      header: { height: 116, background: 'rgb(255, 255, 255)' },
      contentWidth: 960,
      elements: el({
        h1: {
          size: 40,
          weight: 300,
          color: 'rgb(17, 17, 17)',
          align: 'left',
          family: 'playfair display',
          background: 'rgb(255, 255, 255)',
        },
        // within the limits: 1.5px (under 10%), weight 0, a near colour
        h2: {
          size: 33.5,
          weight: 400,
          color: 'rgb(20, 20, 20)',
          align: 'left',
          family: 'lato',
        },
        p: {
          size: 16,
          weight: 400,
          color: 'rgb(51, 51, 51)',
          align: 'left',
          family: 'lato',
        },
      }),
    }
    const diffs = styleDiff(ref, mine)
    assert.deepEqual(
      diffs.map((d) => d.text),
      ['h1: original 56px 700 #a3132f center; yours 40px 300 #111111 left']
    )
    // the cream background only counts once it is noticeably far from white
    const cream = styleDiff(ref, {
      ...mine,
      pageBackground: 'rgb(245, 222, 200)',
    })
    assert.ok(
      cream.some(
        (d) => d.text === 'page background: original #ffffff; yours #f5dec8'
      )
    )
    assert.equal(cream[0]!.what, 'h1')
  })

  test('an element the original has and ours lacks, a header, the text column; at most six lines', () => {
    const ref: StyleSummary = {
      header: { height: 120, background: 'rgb(0, 0, 0)' },
      contentWidth: 980,
      elements: {
        h1: {
          size: 56,
          weight: 700,
          color: '#000',
          align: 'center',
          family: 'a',
          text: 'Wild Woman Reborn',
        },
        h2: {
          size: 30,
          weight: 700,
          color: '#000',
          align: 'center',
          family: 'a',
        },
        h3: {
          size: 20,
          weight: 700,
          color: '#000',
          align: 'center',
          family: 'a',
        },
        p: {
          size: 18,
          weight: 400,
          color: '#000',
          align: 'center',
          family: 'a',
        },
        button: {
          size: 16,
          weight: 700,
          color: '#fff',
          align: 'center',
          family: 'a',
          background: 'rgb(163, 19, 47)',
        },
      },
    }
    const mine: StyleSummary = {
      header: { height: 60, background: 'rgb(255, 255, 255)' },
      contentWidth: 640,
      elements: {
        h2: {
          size: 30,
          weight: 700,
          color: '#000',
          align: 'left',
          family: 'b',
        },
        h3: {
          size: 20,
          weight: 700,
          color: '#000',
          align: 'left',
          family: 'a',
        },
        p: {
          size: 14,
          weight: 400,
          color: '#000',
          align: 'center',
          family: 'a',
        },
        button: {
          size: 16,
          weight: 700,
          color: '#fff',
          align: 'center',
          family: 'a',
          background: 'rgb(255, 255, 255)',
        },
      },
    }
    const texts = styleDiff(ref, mine).map((d) => d.text)
    assert.equal(texts.length, 6)
    assert.ok(
      texts.includes(
        'h1: original 56px 700 #000000 center "a" ("Wild Woman Reborn"); yours has no visible h1'
      )
    )
    assert.ok(
      texts.includes(
        'header: original 120px tall, #000000; yours 60px tall, #ffffff'
      )
    )
    assert.ok(
      texts.includes(
        'primary button/link: original 16px 700 #ffffff on #a3132f; yours 16px 700 #ffffff on #ffffff'
      )
    )
    assert.ok(
      texts.some((t) =>
        t.startsWith(
          'h2: original 30px 700 #000000 center "a"; yours 30px 700 #000000 left "b"'
        )
      )
    )
    assert.deepEqual(styleDiff(ref, ref), [])
  })

  test('a phone-zoomed reference is compared in screen pixels, and web-font names are one font', () => {
    assert.equal(fontName('playfair-display-v2'), 'playfair display')
    assert.equal(fontName('Playfair Display'), 'playfair display')
    const h1 = (size: number, family: string) => ({
      h1: { size, weight: 700, color: '#a3132f', align: 'center', family },
    })
    // Wix lays its phone page out at 320 and the phone zooms it 1.22x: 20px there is 24.4px on screen
    const ref: StyleSummary = {
      scale: 1.21875,
      contentWidth: 280,
      elements: h1(20, 'playfair-display-v2'),
    }
    assert.deepEqual(
      styleDiff(ref, {
        contentWidth: 341,
        elements: h1(24, 'Playfair Display'),
      }),
      []
    )
    assert.deepEqual(
      styleDiff(ref, {
        contentWidth: 341,
        elements: h1(32, 'Playfair Display'),
      }).map((d) => d.text),
      ['h1: original 24.4px 700 #a3132f center; yours 32px 700 #a3132f center']
    )
  })
})
