import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrandBrowser } from './browser.js'
import { contrastText, glyphSvg, injectIconTags, pngToIco, writeFavicon } from './favicon.js'

const fakeBrowser = (): BrandBrowser & { sizes: number[]; pages: string[] } => {
  const sizes: number[] = []
  const pages: string[] = []
  return {
    sizes,
    pages,
    screenshot: async (html, size) => {
      sizes.push(size)
      pages.push(html)
      return Buffer.from(`png-${size}`)
    },
    evaluate: async () => {
      throw new Error('unused')
    },
    close: async () => {},
  }
}

const appDir = () => mkdtempSync(join(tmpdir(), 'favicon-'))

test('pngToIco wraps the PNG behind a one-entry ICONDIR', () => {
  const ico = pngToIco(Buffer.from('abc'), 196)
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 1)
  assert.equal(ico.readUInt8(6), 196)
  assert.equal(ico.readUInt32LE(14), 3)
  assert.equal(ico.readUInt32LE(18), 22)
  assert.equal(ico.subarray(22).toString(), 'abc')
})

test('a 256px icon is recorded as size 0', () => {
  assert.equal(pngToIco(Buffer.from('x'), 256).readUInt8(6), 0)
})

test('glyphs contrast with their background and are escaped', () => {
  assert.equal(contrastText('#ffffff'), '#111111')
  assert.equal(contrastText('#101010'), '#ffffff')
  assert.match(glyphSvg('<&', '#000000'), /&lt;&amp;<\/text>/)
})

test('a synthesized favicon writes the icon set and links it from index.html', async () => {
  const dir = appDir()
  writeFileSync(join(dir, 'index.html'), '<html>\n  <head>\n    <title>x</title>\n  </head>\n</html>\n')
  const browser = fakeBrowser()
  const result = await writeFavicon(browser, { appDir: dir, letter: 'Kx', background: '#ffffff' })
  assert.deepEqual(browser.sizes, [196, 180, 192, 512])
  assert.match(browser.pages[0]!, /padding:0%/)
  assert.equal(result.faviconIco, true)
  assert.deepEqual(result.generated, ['favicon-196.png', 'apple-icon-180.png', 'manifest-icon-192.png', 'manifest-icon-512.png', 'favicon.ico'])
  assert.equal(readFileSync(join(dir, 'public', 'favicon.ico')).subarray(22).toString(), 'png-196')
  const html = readFileSync(join(dir, 'index.html'), 'utf8')
  assert.match(html, /<link rel="icon" type="image\/x-icon" href="\/favicon.ico">\n {4}<link/)
  assert.match(html, /apple-icon-180.png">\n {2}<\/head>/)
  assert.equal(result.injectedInto, 'index.html')
})

test('a source image is framed with padding', async () => {
  const dir = appDir()
  mkdirSync(join(dir, 'public'))
  writeFileSync(join(dir, 'public', 'logo.svg'), '<svg/>')
  const browser = fakeBrowser()
  await writeFavicon(browser, { appDir: dir, source: join(dir, 'public', 'logo.svg') })
  assert.match(browser.pages[0]!, /padding:10%/)
  assert.match(browser.pages[0]!, /data:image\/svg\+xml;base64,/)
})

test('a TanStack Start root gets JSX links after HeadContent and loses its data-URI icons', () => {
  const dir = appDir()
  mkdirSync(join(dir, 'src', 'routes'), { recursive: true })
  const root = join(dir, 'src', 'routes', '__root.tsx')
  writeFileSync(
    root,
    `<head>\n        {/* keep me */}\n        <HeadContent />\n        {/* the template's mark */}\n        <link\n          rel="icon"\n          media="(prefers-color-scheme: light)"\n          href="data:image/svg+xml,%3Csvg%3E"\n        />\n        <Other />\n      </head>`
  )
  const result = injectIconTags(dir, [{ rel: 'icon', href: '/favicon.ico' }])
  assert.equal(result.file, 'src/routes/__root.tsx')
  assert.equal(
    readFileSync(root, 'utf8'),
    `<head>\n        {/* keep me */}\n        <HeadContent />\n        <link rel="icon" href="/favicon.ico" />\n        <Other />\n      </head>`
  )
  assert.deepEqual(injectIconTags(dir, [{ rel: 'icon', href: '/favicon.ico' }]).added, [])
})

test('an app with no document head still gets its icons, and says so', async () => {
  const dir = appDir()
  const result = await writeFavicon(fakeBrowser(), { appDir: dir, emoji: 'x' })
  assert.equal(result.injectedInto, null)
  assert.equal(existsSync(join(dir, 'public', 'favicon-196.png')), true)
  assert.match(result.note, /no tags were injected/)
})
