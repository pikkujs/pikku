import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrandError, BrandWorkspace } from './brand-workspace.js'
import { crawlSite, extractImages, type CrawlSnapshot } from './site-crawl.js'

const workspace = (apps: string[]) => {
  const root = mkdtempSync(join(tmpdir(), 'brand-ws-'))
  for (const app of apps) {
    mkdirSync(join(root, app), { recursive: true })
    writeFileSync(join(root, app, 'vite.config.ts'), 'export default {}')
  }
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'pkg', 'vite.config.ts'), '')
  return root
}

const fakeFetch = (routes: Record<string, () => Response>): typeof fetch =>
  (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input)
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
    if (!hit) return new Response('nope', { status: 404 })
    return hit[1]()
  }) as typeof fetch

test('frontends are discovered by vite config, outside node_modules', () => {
  const ws = new BrandWorkspace(workspace(['apps/app', 'apps/portal']))
  assert.deepEqual(ws.frontends().map((f) => f.name), ['apps/app', 'apps/portal'])
  assert.equal(ws.frontend('portal').name, 'apps/portal')
  assert.throws(() => ws.frontend(), /pass --app/)
})

test('configured frontends win, and their primary is the default', () => {
  const root = workspace(['apps/app'])
  const ws = new BrandWorkspace(root, { frontends: { web: { cwd: 'apps/app', primary: true }, other: { cwd: 'apps/x' } } })
  assert.equal(ws.frontend().dir, join(root, 'apps/app'))
})

test('stock images need the caller’s own key', async () => {
  const ws = new BrandWorkspace(workspace(['apps/app']))
  await assert.rejects(ws.stockImages({ query: 'bikes' }), (e: unknown) => e instanceof BrandError && e.kind === 'unavailable')
})

test('stock images are searched, downloaded into public/stock and credited', async () => {
  const root = workspace(['apps/app'])
  const ws = new BrandWorkspace(root, {
    unsplashAccessKey: async () => 'key',
    fetch: fakeFetch({
      'https://api.unsplash.com/': () =>
        Response.json({
          results: [
            { alt_description: 'a bike', urls: { regular: 'https://images.test/bike.jpg?w=1080' }, user: { name: 'Ana', links: { html: 'https://u/ana' } } },
            { alt_description: null, urls: { regular: 'https://images.test/broken' }, user: {} },
          ],
        }),
      'https://images.test/bike.jpg': () => new Response('jpg-bytes', { headers: { 'content-type': 'image/jpeg' } }),
      'https://images.test/broken': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    }),
  })
  const result = await ws.stockImages({ query: 'bikes', count: 2 })
  assert.deepEqual(result.images, [{ path: '/stock/01-bike.jpg', alt: 'a bike', credit: 'Ana', creditUrl: 'https://u/ana' }])
  assert.equal(result.failed.length, 1)
  assert.equal(readFileSync(join(root, 'apps/app/public/stock/01-bike.jpg'), 'utf8'), 'jpg-bytes')
})

test('extract needs exactly one source', async () => {
  const ws = new BrandWorkspace(workspace(['apps/app']))
  await assert.rejects(ws.extract({}), /exactly one/)
  await assert.rejects(ws.extract({ url: 'a', file: 'b' }), /exactly one/)
})

test('extract from a tokens file returns a theme input', async () => {
  const root = workspace(['apps/app'])
  writeFileSync(join(root, 'tokens.json'), JSON.stringify({ primary: { $value: '#ff0000', $type: 'color' } }))
  const { profile, theme } = await new BrandWorkspace(root).extract({ file: 'tokens.json', preset: 'x' })
  assert.equal(profile.colors.primary, '#ff0000')
  assert.equal(theme.preset, 'x')
  assert.equal(theme.colors?.primary, '#ff0000')
})

test('images are pulled from og tags, img, srcset and CSS backgrounds', () => {
  const html = `<meta property="og:image" content="/hero.jpg"><img src="a.png" alt="A"><img srcset="b.png 1x, c.png 2x"><div style="background-image:url('/bg.webp')"></div><img src="data:x">`
  assert.deepEqual(
    extractImages(html, 'https://site.test/page/').map((i) => i.src),
    ['https://site.test/hero.jpg', 'https://site.test/page/a.png', 'https://site.test/page/b.png', 'https://site.test/bg.webp']
  )
})

test('a crawl polls until done, then pages through every record once', async () => {
  const snap = (over: Partial<CrawlSnapshot>): CrawlSnapshot => ({ status: 'completed', finished: 2, total: 2, cursor: null, pages: [], ...over })
  const page = (url: string, markdown = 'x') => ({ url, title: null, markdown, images: [], status: 200 })
  const polls: unknown[] = []
  const answers = [
    snap({ status: 'running' }),
    snap({}),
    snap({ cursor: 1, pages: [page('a'), page('empty', ' ')] }),
    snap({ cursor: 2, pages: [page('a'), page('b')] }),
    snap({ cursor: 2, pages: [] }),
  ]
  const result = await crawlSite(
    { start: async () => 'job', poll: async (_id, options) => (polls.push(options), answers.shift()!) },
    'https://site.test',
    { sleep: async () => {} }
  )
  assert.equal(result.done, true)
  assert.deepEqual(result.pages.map((p) => p.url), ['a', 'b'])
  assert.equal(polls.length, 5)
})

test('crawling needs the caller’s own Cloudflare account', async () => {
  const ws = new BrandWorkspace(workspace(['apps/app']))
  await assert.rejects(ws.crawl({ url: 'site.test' }), /CLOUDFLARE_ACCOUNT_ID/)
})
