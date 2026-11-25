import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import {
  compareShot,
  decodeImage,
  diffImages,
  encodePng,
  gitStamp,
  imageWidth,
  loadSiteCapture,
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

  test('reads viewport folders when there is no <id>-<width> screenshot: the width from a number, else from the image', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pages-compare-'))
    for (const sub of ['laptop', 'phone', '1920', 'small', 'pictures'])
      mkdirSync(join(dir, sub))
    writeFileSync(join(dir, 'laptop', 'about.png'), encodePng(page(144, 30)))
    writeFileSync(join(dir, 'laptop', 'about.style.json'), '{}')
    const phone = page(39, 20)
    writeFileSync(
      join(dir, 'phone', 'index.jpg'),
      jpeg.encode({ ...phone, data: Buffer.from(phone.data) }).data
    )
    writeFileSync(join(dir, '1920', 'index.png'), encodePng(page(50, 10)))
    writeFileSync(join(dir, 'small', 'index-1440-0.jpg'), '')
    writeFileSync(join(dir, 'pictures', 'hero.jpg'), '')
    writeFileSync(join(dir, 'layout-notes.json'), '{}')
    assert.equal(imageWidth(join(dir, 'phone', 'index.jpg')), 39)
    assert.deepEqual(
      readReference(dir).map((s) => [s.id, s.width, !!s.style]),
      [
        ['index', 1920, false],
        ['about', 144, true],
        ['index', 39, false],
      ]
    )
    // the standard layout wins when both are there
    writeFileSync(join(dir, 'index-1440.jpg'), '')
    assert.deepEqual(
      readReference(dir).map((s) => [s.id, s.width]),
      [['index', 1440]]
    )
    const empty = mkdtempSync(join(tmpdir(), 'pages-compare-'))
    assert.throws(() => readReference(empty), /pikku ui pages capture/)
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

describe('the capture script behind pikku ui pages capture', () => {
  test('is loaded with its capture, page list and picture download; pictures land in <out>/pictures with their file recorded', async () => {
    const site = await loadSiteCapture()
    assert.ok(site?.capture && site.pages && site.downloadPictures)
    const png = encodePng(page(8, 8))
    const server = createServer((req, res) => {
      if (req.url === '/media/hero.png') res.end(png)
      else res.writeHead(404).end()
    })
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const out = mkdtempSync(join(tmpdir(), 'pages-capture-'))
    writeFileSync(
      join(out, 'index.json'),
      JSON.stringify({
        id: 'index',
        pictures: [
          { src: `${base}/media/hero.png`, file: null },
          { src: `${base}/gone.jpg`, file: null },
        ],
      })
    )
    writeFileSync(join(out, 'index-1440.layout.json'), '{"images":[]}')
    try {
      const got = (await site.downloadPictures!(out)) as {
        downloaded: number
        failed: number
      }
      assert.equal(got.downloaded, 1)
      assert.equal(got.failed, 1)
    } finally {
      server.close()
    }
    const doc = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const file = doc.pictures[0].file as string
    assert.match(file, /^pictures\/hero-[0-9a-f]{8}\.png$/)
    assert.deepEqual(readFileSync(join(out, file)), png)
    assert.equal(doc.pictures[1].file, null)
    const index = JSON.parse(
      readFileSync(join(out, 'pictures', 'index.json'), 'utf8')
    )
    assert.deepEqual(index[`${base}/media/hero.png`], {
      file,
      pages: ['index'],
    })
  })
})

/** A chromium to capture with, or null where none starts (the capture test is skipped there). */
const CHROMIUM: unknown = await (async () => {
  for (const name of ['@playwright/test', 'playwright-core']) {
    const mod = await import(name).catch(() => null)
    if (!mod?.chromium) continue
    const browser = await mod.chromium
      .launch({
        executablePath:
          process.env.PIKKU_CHROMIUM ||
          process.env.PLAYWRIGHT_CHROMIUM_PATH ||
          undefined,
      })
      .catch(() => null)
    if (!browser) return null
    await browser.close()
    return mod.chromium
  }
  return null
})()

describe('the capture of what a site relies on and does', () => {
  test(
    'records outside hosts, redirects, cookies by name, forms with their field types and an empty submit sent nowhere, and interactions before and after',
    { timeout: 120_000, skip: !CHROMIUM && 'no chromium to capture with' },
    async () => {
      const site = (await loadSiteCapture()) as unknown as {
        capture: (
          out: string,
          urls: string[],
          widths: number[],
          tiles: boolean,
          jobs: number,
          opts: Record<string, unknown>
        ) => Promise<unknown>
      }
      const chromium = CHROMIUM
      let posts = 0
      const page = (assets: string) => `<!doctype html><html lang="en"><head>
<link rel="stylesheet" href="${assets}/site.css"><script src="${assets}/tracker.js"></script>
<style>nav a { color: rgb(0, 0, 0); transition: color 0.2s ease } nav a:hover { color: rgb(200, 0, 0) } #menu[hidden] { display: none }</style>
</head><body><header><nav><a href="/">Home</a><a href="/about">About</a><a href="/feed">Feed</a><a href="/wp-json/pages">API</a><a href="/guide.pdf">Guide</a></nav>
<button aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.getElementById('menu').hidden=false">Menu</button>
<div id="menu" hidden>Workshops and circles and events</div></header>
<main><h1>Welcome</h1><div class="apply">
<label for="email">Email</label><input id="email" name="email" type="email" required>
<div><div><select aria-label="Country code"><option>+49</option><option>+44</option></select><input name="phone" type="tel" aria-label="Phone"></div></div>
<button onclick="fetch('/api/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'',phone:''})})">Send</button>
</div>${assets ? `<iframe src="${assets}/embed" title="Booking"></iframe>` : ''}</main><script>localStorage.setItem('visited','1');console.log('hello from the page')</script></body></html>`
      const server = createServer((req, res) => {
        const host = req.headers.host!
        const assets = host.startsWith('127.0.0.1')
          ? `http://localhost:${host.split(':')[1]}`
          : ''
        if (host.startsWith('localhost') && req.url === '/moved')
          res
            .writeHead(301, {
              location: `http://127.0.0.1:${host.split(':')[1]}/`,
            })
            .end()
        else if (req.method === 'POST') {
          posts++
          res.end('{}')
        } else if (req.url === '/old')
          res.writeHead(301, { location: '/' }).end()
        else if (req.url === '/site.css')
          res
            .writeHead(200, { 'content-type': 'text/css' })
            .end('body{margin:0}')
        else if (req.url === '/embed')
          res
            .writeHead(200, { 'content-type': 'text/html' })
            .end(
              `<!doctype html><title>Book a session</title><h2>Choose a session</h2><div class="intake"><label for="type">Session</label><select id="type" name="type" required><option>First session 90 min</option><option>Follow-up 80 min</option></select><label for="who">Name</label><input id="who" name="who" required><button onclick="fetch('/book',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'',who:''})})">Book</button></div>`
            )
        else if (req.url === '/feed')
          res
            .writeHead(200, { 'content-type': 'application/rss+xml' })
            .end('<rss/>')
        else if (req.url === '/wp-json/pages')
          res.writeHead(200, { 'content-type': 'application/json' }).end('[]')
        else if (req.url === '/guide.pdf')
          res
            .writeHead(200, { 'content-type': 'application/pdf' })
            .end('%PDF-1.4')
        else if (req.url === '/tracker.js')
          res
            .writeHead(200, { 'content-type': 'text/javascript' })
            .end("document.cookie='seen=1; path=/'")
        else
          res
            .writeHead(200, {
              'content-type': 'text/html',
              'set-cookie': 'session=secret-value; HttpOnly',
            })
            .end(page(assets))
      })
      await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const out = mkdtempSync(join(tmpdir(), 'pages-behaviour-'))
      const listed = await (
        site as unknown as { pages: (root: string) => Promise<string[]> }
      ).pages(`${base}/`)
      assert.deepEqual(listed, [`${base}/`, `${base}/about`])
      // an address that moves to another host of the site (a bare domain to www) is listed on the host it lands on
      const port = (server.address() as AddressInfo).port
      assert.deepEqual(
        await (
          site as unknown as { pages: (root: string) => Promise<string[]> }
        ).pages(`http://localhost:${port}/moved`),
        [`${base}/`, `${base}/about`]
      )
      try {
        await site.capture(out, [`${base}/old|home`], [1440], false, 1, {
          chromium,
          pictures: false,
          log: () => {},
        })
      } finally {
        server.close()
      }
      const summary = JSON.parse(
        readFileSync(join(out, 'behaviour.json'), 'utf8')
      )
      const page1 = JSON.parse(
        readFileSync(join(out, 'home.behaviour.json'), 'utf8')
      )
      assert.deepEqual(Object.keys(summary.outsideHosts), ['localhost'])
      assert.deepEqual(summary.outsideHosts.localhost.pages, ['home'])
      assert.deepEqual(page1.redirects, [`${base}/old`])
      assert.deepEqual(page1.setsCookies, ['session'])
      assert.ok(page1.cookies.some((c: { name: string }) => c.name === 'seen'))
      assert.ok(!JSON.stringify(page1).includes('secret-value'))
      assert.deepEqual(page1.storage.local, ['visited'])
      assert.ok(
        page1.console.some((l: string) => /hello from the page/.test(l))
      )
      const [form] = summary.forms
      const types = form.fields.map((f: { type: string }) => f.type)
      assert.ok(types.includes('email') && types.includes('tel'))
      const phone = form.fields.find((f: { type: string }) => f.type === 'tel')
      assert.match(phone.beside.join(' '), /\+49/)
      assert.equal(
        form.fields.find((f: { type: string }) => f.type === 'email').required,
        true
      )
      assert.equal(posts, 0, 'the empty submit reached the server')
      assert.deepEqual(
        form.submit.wouldSend.map(
          (s: { method: string; path: string; fields: string[] }) => [
            s.method,
            s.path,
            s.fields,
          ]
        ),
        [['POST', '/api/submit', ['email', 'phone']]]
      )
      assert.equal(
        form.submit.validation,
        'server-side, not observable without a POST'
      )
      const hover = summary.interactions.find(
        (i: { kind: string; what: string }) =>
          i.kind === 'hover' && /Home/.test(i.what)
      )
      assert.deepEqual(hover.changes.color, ['rgb(0, 0, 0)', 'rgb(200, 0, 0)'])
      const open = summary.interactions.find(
        (i: { kind: string }) => i.kind === 'open'
      )
      assert.equal(open.expanded, 'true')
      assert.ok(open.textAdded > 0)
      for (const picture of open.pictures)
        assert.ok(readFileSync(join(out, picture)).length > 0)
      assert.ok(
        summary.motion.some((m: { transition?: string }) =>
          /color 0\.2s/.test(m.transition ?? '')
        )
      )
      assert.match(page1.accessibility, /button "Menu"/)
      const [frame] = summary.frames
      assert.equal(frame.src, `http://localhost:${port}/embed`)
      assert.equal(frame.title, 'Book a session')
      assert.ok(frame.choices.includes('Book'))
      assert.deepEqual(frame.forms[0].fields[0].options, [
        'First session 90 min',
        'Follow-up 80 min',
      ])
      assert.deepEqual(
        frame.submits[0].wouldSend.map((w: { path: string }) => w.path),
        ['/book']
      )
      assert.deepEqual(Object.keys(frame.hosts), ['localhost'])
      assert.deepEqual(
        summary.downloads.map((d: { href: string }) => d.href),
        [`${base}/guide.pdf`]
      )
    }
  )
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
      [
        'h1: original 56px 700 #a3132f center; yours 40px 300 #111111 left',
        'page background: original #ffffff; yours #fdf3f1',
      ]
    )
    // a background a hair off white is not a difference
    assert.deepEqual(
      styleDiff(ref, { ...mine, pageBackground: 'rgb(255, 253, 249)' }).map(
        (d) => d.what
      ),
      ['h1']
    )
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
