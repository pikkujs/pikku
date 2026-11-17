#!/usr/bin/env node
// site_capture.mjs: capture and compare the reference of a website you are cloning, from the RENDERED page.
//   node site_capture.mjs pages <root-url>                          page list: sitemap(s), else internal links
//   node site_capture.mjs capture <out-dir> [--viewports 1440,390,1920] [--tiles] [--jobs 4] <url|@file-with-urls> ...
//   node site_capture.mjs pictures <out-dir>                        download the pictures the capture listed (capture does it too)
//   node site_capture.mjs shot <out-dir> <url> [--width 1440]       one page, one width: screenshot + tiles, quick (use after each change)
//   node site_capture.mjs compare <reference-dir> <clone-dir> [--page id] [--width 1440]
//                                                                   section-by-section differences (columns, pictures, height) and a match score
//   node site_capture.mjs check <base-url> <reference-dir> [--page id | --all]
//       no flag: every page answers 200, has its content in the server-rendered HTML, its links resolve (no browser, quick)
//       --page id: also open that page in the browser at 390/1440/1920 and report horizontal overflow, broken pictures, script errors
//       --all: the same for every page, 4 at a time (slow: run it in the background, output to a file); prints only problems
//   capture writes per page and width: <id>-<width>.jpg (screenshot), .layout.json (sections), .style.json (computed style of the
//   page background, header, h1/h2/h3, first paragraph, primary button, text column: pikku ui pages compare diffs it against yours)
//   <id>.json lists the page's pictures ({ src, file }); capture downloads them into <out-dir>/pictures/ and sets `file`
//   (relative to <out-dir>); pictures/index.json maps each original address to its file and pages. capture.json lists the run.
// `pikku ui pages capture <url> --out artifacts/references/<site>` runs the same capture (page list included) from the CLI.
// <out-dir>/<reference-dir> is the project's reference artifact: artifacts/references/<site> (site = the original's host name).
// To compare your pages with it use `pikku ui pages compare --reference artifacts/references/<site> --baseUrl <url>`.
// Needs a Chromium and playwright-core: PIKKU_CHROMIUM (or PLAYWRIGHT_CHROMIUM_PATH) = path of the chrome binary, PLAYWRIGHT_CORE = path of the playwright-core
// module (default: `playwright-core` resolved from the current directory). Browser profile, tmp and downloads stay under <out-dir>/.browser.
// Tiles and pixel scores use ImageMagick (`convert`, `compare`) when it is installed.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, extname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { return String(e.stderr || '') + String(e.stdout || '') } }
const idOf = (url) => { const p = new URL(url).pathname.replace(/^\/+|\/+$/g, ''); return p ? p.replace(/\//g, '__') : 'index' }
const UA = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// ---------------------------------------------------------------- pages
/** The site's page list: sitemap(s), then same-site links. */
export async function pages(root) {
  const base = new URL(root).origin
  const seen = new Set(), out = []
  const add = (u) => { try { const x = new URL(u, base); x.hash = ''; x.search = ''; if (x.origin === base && !/\.(jpe?g|png|gif|webp|svg|pdf|css|js|xml|json|ico|txt)$/i.test(x.pathname)) { const k = x.origin + (x.pathname.replace(/\/+$/, '') || '/'); if (!seen.has(k)) { seen.add(k); out.push(k) } } } catch {} }
  const get = async (u) => { try { return await (await fetch(u, { headers: { 'user-agent': UA } })).text() } catch { return '' } }
  const maps = [`${base}/sitemap.xml`]
  const robots = await get(`${base}/robots.txt`)
  for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) maps.push(m[1])
  const done = new Set()
  while (maps.length) {
    const m = maps.shift(); if (done.has(m)) continue; done.add(m)
    const x = await get(m)
    for (const l of x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) (l[1].endsWith('.xml') ? maps : { push: add }).push(l[1])
  }
  // the sitemap is the list; internal links catch what it misses
  const queue = [base + '/', ...out]
  for (let i = 0; i < queue.length && i < 200; i++) {
    const html = await get(queue[i])
    for (const h of html.matchAll(/href="([^"#]+)/g)) { const before = out.length; add(h[1].replace(/&amp;/g, '&')); if (out.length > before) queue.push(out[out.length - 1]) }
  }
  return out
}

// ---------------------------------------------------------------- in-page extraction (runs in the browser)
export function extractInPage() {
  const W = document.documentElement.scrollWidth, H = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 }
  const box = (r) => ({ x: (r.left + scrollX) / W, y: (r.top + scrollY) / H, w: r.width / W, h: r.height / H })
  const images = [], texts = []
  for (const el of document.querySelectorAll('*')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'PICTURE') { if (r.width >= 40 && r.height >= 40) images.push({ ...box(r), src: (el.currentSrc || el.src || el.poster || '').slice(0, 300), natural: [el.naturalWidth || 0, el.naturalHeight || 0] }); continue }
    const bg = getComputedStyle(el).backgroundImage
    if (bg && bg !== 'none' && /url\(/.test(bg) && r.width >= 40 && r.height >= 40) images.push({ ...box(r), src: (bg.match(/url\(["']?([^"')]+)/) || [])[1]?.slice(0, 300) || '', background: true })
    let own = ''; const rects = []
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { own += n.textContent.trim() + ' '; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 2) rects.push(q) }
    if (own.trim().length >= (/^H[1-6]$/.test(el.tagName) ? 1 : 12) && rects.length) {
      const l = Math.min(...rects.map((q) => q.left)), t = Math.min(...rects.map((q) => q.top)), rr = Math.max(...rects.map((q) => q.right)), b = Math.max(...rects.map((q) => q.bottom))
      texts.push({ ...box({ left: l, top: t, width: rr - l, height: b - t }), tag: el.tagName.toLowerCase(), size: parseFloat(getComputedStyle(el).fontSize), text: own.trim().slice(0, 80) })
    }
  }
  const all = [...images.map((b) => ({ ...b, kind: 'img' })), ...texts.map((b) => ({ ...b, kind: 'text' }))].filter((b) => b.w > 0.01 && b.h > 0.002).sort((a, b) => a.y - b.y)
  // bands: vertical runs of boxes (a gap of 1.2% of the page or more starts a new band)
  const bands = []
  for (const b of all) {
    const last = bands[bands.length - 1]
    if (last && b.y <= last.y1 + 0.012) { last.items.push(b); last.y1 = Math.max(last.y1, b.y + b.h) } else bands.push({ y0: b.y, y1: b.y + b.h, items: [b] })
  }
  const outBands = bands.map((bd) => {
    // columns: horizontally disjoint groups of boxes, ignoring slivers
    const iv = bd.items.map((b) => [b.x, b.x + b.w]).sort((a, b) => a[0] - b[0]); const groups = []
    for (const v of iv) { const g = groups[groups.length - 1]; if (g && v[0] < g[1] - 0.02) g[1] = Math.max(g[1], v[1]); else groups.push([...v]) }
    const cols = groups.filter((g) => g[1] - g[0] > 0.06).length || 1
    const txt = bd.items.filter((b) => b.kind === 'text'), imgs = bd.items.filter((b) => b.kind === 'img')
    const tx = txt.length ? txt.reduce((s, b) => s + b.x + b.w / 2, 0) / txt.length : 0.5
    return { y0: +bd.y0.toFixed(4), y1: +bd.y1.toFixed(4), cols, fullBleed: imgs.some((b) => b.w > 0.9), images: imgs.map((b) => ({ x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4), side: cols >= 2 ? (b.x + b.w / 2 < tx ? 'left' : 'right') : 'inline' })), textBlocks: txt.length }
  })
  return { doc: { w: W, h: H }, bands: outBands, images: images.map((b) => ({ x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4), src: b.src, natural: b.natural })), counts: { sections: outBands.length, images: images.length, textBlocks: texts.length, multiColumnSections: outBands.filter((b) => b.cols >= 2).length } }
}

/**
 * The computed style of the elements a reader notices first, the same on the original and on the clone
 * (pikku ui pages compare runs it on our page): page background, the header, h1/h2/h3, the first paragraph,
 * the primary button or link, and the width of the text column. Colours are left as the browser gives them.
 */
export function extractStyleInPage() {
  // any CSS colour (oklch, oklab, color(), named) as rgb()/rgba(), read back through a 1x1 canvas
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true })
  const rgb = (c) => {
    if (!c || /^rgba?\(/.test(c) || !g) return c
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0, 0, 1, 1)
    const [r, gg, b, a] = g.getImageData(0, 0, 1, 1).data
    return a === 255 ? `rgb(${r}, ${gg}, ${b})` : `rgba(${r}, ${gg}, ${b}, ${+(a / 255).toFixed(3)})`
  }
  const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 }
  const chrome = 'header, nav, footer, [role=banner], [role=navigation], [role=contentinfo], #SITE_HEADER, #SITE_FOOTER'
  const inChrome = (el) => !!el.closest(chrome)
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!clear(c)) return c } return 'rgb(255, 255, 255)' }
  const alignOf = (cs) => { const a = cs.textAlign; return a === 'start' ? (cs.direction === 'rtl' ? 'right' : 'left') : a === 'end' ? (cs.direction === 'rtl' ? 'left' : 'right') : a.replace(/^-webkit-/, '') }
  const fam = (cs) => cs.fontFamily.split(',')[0].trim().replace(/["']/g, '').toLowerCase()
  const words = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  // size, weight and colour from the element holding the first words (a site builder puts them on nested spans)
  const textHolder = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim() && n.parentElement && vis(n.parentElement)) return n.parentElement; return el }
  // what is behind the words on screen: the first colour or picture under their centre (scrolled into view to look)
  const behind = (el) => {
    const holder = textHolder(el); const rg = document.createRange(); rg.selectNodeContents(holder)
    holder.scrollIntoView({ block: 'center' })
    const r = [...rg.getClientRects()].find((q) => q.width > 2) || holder.getBoundingClientRect()
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    for (const e of document.elementsFromPoint(x, y)) {
      if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(e.tagName) || /^wow-image$|^wix-video$/i.test(e.tagName)) return 'picture'
      const cs = getComputedStyle(e)
      if (cs.backgroundImage && /url\(/.test(cs.backgroundImage)) return 'picture'
      if (!clear(cs.backgroundColor)) return rgb(cs.backgroundColor)
    }
    return rgb(bgOf(el))
  }
  // one line of text centred on the page reads as centred, whatever text-align says (a builder centres the box instead)
  const visualAlign = (el, computed) => {
    if (computed === 'center' || computed === 'justify') return computed
    const rg = document.createRange(); rg.selectNodeContents(el)
    const rects = [...rg.getClientRects()].filter((q) => q.width > 2)
    if (!rects.length || rects.some((q) => Math.abs(q.top - rects[0].top) > 4)) return computed
    const l = Math.min(...rects.map((q) => q.left)), rr = Math.max(...rects.map((q) => q.right))
    return Math.abs((l + rr) / 2 - vw / 2) < vw * 0.03 && rr - l < vw * 0.85 ? 'center' : computed
  }
  const describe = (el) => {
    if (!el) return null
    const cs = getComputedStyle(textHolder(el)), own = getComputedStyle(el)
    const weight = Number(cs.fontWeight) || (cs.fontWeight === 'bold' ? 700 : 400)
    return { text: words(el).slice(0, 60), size: Math.round(parseFloat(cs.fontSize) * 10) / 10, weight, color: rgb(cs.color), align: visualAlign(el, alignOf(own)), family: fam(cs), background: behind(el) }
  }
  const first = (sel, ok = () => true) => [...document.querySelectorAll(sel)].find((el) => vis(el) && !inChrome(el) && words(el) && ok(el)) || null
  const vw = document.documentElement.clientWidth || innerWidth, docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  // the page background: the deepest full-width box with a colour that covers most of the page (or the window, when fixed)
  let pageBg = null, depth = -1
  for (const el of [document.documentElement, document.body, ...document.body.querySelectorAll('div, main, section')]) {
    const cs = getComputedStyle(el); if (clear(cs.backgroundColor) || !vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < vw * 0.95 || !(r.height >= docH * 0.5 || (cs.position === 'fixed' && r.height >= innerHeight * 0.9))) continue
    let d = 0; for (let e = el; e; e = e.parentElement) d++
    if (d > depth) { depth = d; pageBg = cs.backgroundColor }
  }
  const header = [...document.querySelectorAll('header, [role=banner], #SITE_HEADER')].find((el) => vis(el) && el.getBoundingClientRect().width >= vw * 0.8) || null
  let headerBg = null
  if (header) {
    headerBg = getComputedStyle(header).backgroundColor
    if (clear(headerBg)) { const r = header.getBoundingClientRect(); const layer = [...header.querySelectorAll('*')].find((e) => { const q = e.getBoundingClientRect(); return !clear(getComputedStyle(e).backgroundColor) && q.width * q.height >= r.width * r.height * 0.9 }); headerBg = layer ? getComputedStyle(layer).backgroundColor : bgOf(header) }
  }
  const paras = [...document.querySelectorAll('p')].filter((p) => vis(p) && !inChrome(p) && words(p).length >= 40)
  const widths = paras.map((p) => Math.round(p.getBoundingClientRect().width)).sort((a, b) => a - b)
  const isButton = (el) => { const cs = getComputedStyle(el); const t = words(el); return t.length >= 2 && t.length <= 40 && (!clear(cs.backgroundColor) || (parseFloat(cs.borderTopWidth) >= 1 && !clear(cs.borderTopColor) && el.tagName !== 'INPUT')) }
  const button = first('button, [role=button], input[type=submit], a', isButton) || first('a[class*=btn i], a[class*=button i], button')
  const btn = describe(button)
  if (btn && button) { const cs = getComputedStyle(button); if (!clear(cs.backgroundColor)) btn.background = rgb(cs.backgroundColor) }
  const elements = { h1: describe(first('h1')), h2: describe(first('h2')), h3: describe(first('h3')), p: describe(paras[0] || null), button: btn }
  scrollTo(0, 0)
  return {
    viewport: innerWidth,
    pageBackground: rgb(pageBg || bgOf(document.body)),
    header: header ? { height: Math.round(header.getBoundingClientRect().height), background: rgb(headerBg) } : null,
    contentWidth: widths.length ? widths[Math.floor(widths.length / 2)] : null,
    elements,
  }
}

function extractStructure() {
  const text = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim()
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ level: +h.tagName[1], text: text(h), size: Math.round(parseFloat(getComputedStyle(h).fontSize)) })).filter((h) => h.text)
  const nav = document.querySelector('nav') || document.querySelector('header')
  const menu = nav ? [...nav.querySelectorAll('a')].map(text).filter(Boolean) : []
  const colours = {}, fonts = {}
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect(); const area = Math.min(r.width * r.height, 2e6) / 1e4
    for (const p of ['backgroundColor', 'color', 'borderTopColor']) { const v = cs[p]; if (v && !/rgba\(0, 0, 0, 0\)|transparent/.test(v)) colours[v] = (colours[v] || 0) + (p === 'backgroundColor' ? area : 1) }
    if (text(el) && el.children.length === 0) { const f = cs.fontFamily.split(',')[0].trim().replace(/["']/g, '').toLowerCase(); fonts[f] = (fonts[f] || 0) + 1 }
  }
  const bps = {}
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules } catch { continue } for (const r of rules) if (r.type === 4 && r.conditionText) for (const m of r.conditionText.matchAll(/\((min|max)-width:\s*([\d.]+px)/g)) bps[`${m[1]}-width ${m[2]}`] = (bps[`${m[1]}-width ${m[2]}`] || 0) + 1 }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)])
  return { title: document.title, description: document.querySelector('meta[name=description]')?.content || '', menu, headings, text: text(document.body), coloursByUse: top(colours, 14), fontsByUse: top(fonts, 6), breakpoints: top(bps, 12), bodyBackground: getComputedStyle(document.body).backgroundColor }
}

// ---------------------------------------------------------------- capture
/** `chromium` is a playwright `chromium` the caller already has (the pikku CLI passes its own); else playwright-core is loaded. */
async function launch(out, chromium) {
  if (!chromium) {
    const require = createRequire(resolve('.') + '/')
    chromium = require(process.env.PLAYWRIGHT_CORE ? resolve(process.env.PLAYWRIGHT_CORE) : 'playwright-core').chromium
  }
  const home = resolve(out, '.browser'); mkdirSync(join(home, 'tmp'), { recursive: true })
  // chromium keeps a unix socket in TMPDIR, and a socket path over 107 characters aborts it: a deep project gets a short tmp
  const tmp = join(home, 'tmp').length > 60 ? mkdtempSync(join(tmpdir(), 'site-capture-')) : join(home, 'tmp')
  return chromium.launch({
    executablePath: process.env.PIKKU_CHROMIUM || process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true, downloadsPath: join(home, 'downloads'),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    env: { ...process.env, HOME: home, TMPDIR: tmp, XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache') },
  })
}

/** What a phone sends: a site that picks its markup by user agent serves its mobile page (and its viewport meta) to it. */
export const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
export const PHONE_WIDTH = 600

/**
 * The browser context for one width. Under 600 px it is a phone: an iPhone Safari user agent, isMobile and hasTouch
 * (device scale 1, so screenshot pixels stay CSS pixels). The old desktop user agent with mobile emulation got the
 * desktop markup, which has no viewport meta, so the phone laid it out 980 px wide.
 * A mobile page that fixes its own width (Wix: `width=320`) is scaled up by the phone; `scale` (device scale factor)
 * does the same for the screenshot, so it is `w` pixels wide as on the phone.
 * `viewportMeta` also adds `<meta name=viewport content="width=device-width, initial-scale=1">` before layout when the page has none.
 */
export async function newCaptureContext(browser, w, { viewportMeta = false, phoneUa = true, scale = 1 } = {}) {
  const phone = w < PHONE_WIDTH
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, userAgent: phone && phoneUa ? PHONE_UA : UA, deviceScaleFactor: scale, isMobile: phone, hasTouch: phone })
  if (phone && viewportMeta)
    await ctx.addInitScript(() => {
      const add = () => { if (!document.head || document.querySelector('meta[name=viewport]')) return !!document.head; const m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1'; document.head.prepend(m); return true }
      if (!add()) { const o = new MutationObserver(() => { if (add()) o.disconnect() }); o.observe(document, { childList: true, subtree: true }) }
    })
  return ctx
}

/**
 * A cookie or consent banner over the hero is not part of the page. Click an accept-style button inside an element whose
 * id/class/aria/data attributes mention cookie|consent|gdpr (or a known consent tool); then hide whatever fixed or sticky
 * element still mentions cookie|consent. Returns the text of the button clicked, if any.
 */
export async function dismissConsent(page) {
  const clicked = await page.evaluate(() => {
    const RX = /cookie|consent|gdpr|onetrust|cookiebot|usercentrics|didomi|cmp-/i
    const ACCEPT = /^(accept|agree|allow|i agree|i accept|ok|okay|got it|understood|alle akzeptieren|akzeptieren|zustimmen|accepter|tout accepter|aceptar|accetta)\b/i
    const tag = (el) => [el.id, el.getAttribute('class'), el.getAttribute('aria-label'), el.getAttribute('aria-labelledby'), el.getAttribute('data-hook'), el.getAttribute('data-testid')].filter(Boolean).join(' ')
    for (const root of document.querySelectorAll('body *')) {
      if (!RX.test(tag(root))) continue
      for (const scope of [root, root.shadowRoot].filter(Boolean))
        for (const b of scope.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')) {
          const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
          const r = b.getBoundingClientRect()
          if (t && t.length <= 40 && ACCEPT.test(t) && r.width > 0 && r.height > 0) { b.click(); return t }
        }
    }
    return null
  }).catch(() => null)
  if (clicked) await page.waitForTimeout(800)
  await page.evaluate(() => {
    const RX = /cookie|consent|gdpr|onetrust|cookiebot|usercentrics|didomi/i
    const tag = (el) => [el.id, el.getAttribute('class'), el.getAttribute('aria-label'), el.getAttribute('data-hook'), el.getAttribute('data-testid')].filter(Boolean).join(' ')
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
      const text = el.innerText || ''
      if (RX.test(tag(el)) || (/cookie|consent/i.test(text) && text.length < 1500 && el.getBoundingClientRect().height < innerHeight * 0.6)) el.style.setProperty('display', 'none', 'important')
    }
  }).catch(() => {})
  return clicked
}

/**
 * "Ready" for a screenshot is not the network going quiet (a Wix page never stops asking). It is: the page has loaded,
 * the fonts are in, a consent banner is gone, every lazy picture and section has been scrolled past slowly and has loaded
 * and decoded, the page is back at the top and has stopped changing height. Each wait has a cap (about 45 s in all).
 */
export async function settle(page) {
  await dismissConsent(page)
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const cap = (p, ms) => Promise.race([p, wait(ms)])
    const t0 = Date.now()
    await cap(document.fonts.ready, 5000)
    // lazy pictures: load now, and copy data-src style attributes over a missing or placeholder src
    const eager = () => {
      const placeholder = (v) => !v || v.startsWith('data:') || /blank|placeholder|spacer|lazy/i.test(v)
      for (const img of document.images) {
        if (img.loading === 'lazy') img.loading = 'eager'
        for (const [from, to] of [['data-src', 'src'], ['data-lazy-src', 'src'], ['data-original', 'src'], ['data-srcset', 'srcset'], ['data-lazy-srcset', 'srcset']]) {
          const v = img.getAttribute(from)
          if (v && placeholder(img.getAttribute(to))) img.setAttribute(to, v)
        }
      }
      for (const s of document.querySelectorAll('source[data-srcset]')) if (!s.getAttribute('srcset')) s.setAttribute('srcset', s.getAttribute('data-srcset'))
      for (const f of document.querySelectorAll('iframe[loading=lazy]')) f.loading = 'eager'
    }
    eager()
    // scroll down slowly, a bit more than half a window at a time, so each section enters the view and starts loading
    const step = Math.max(300, Math.round(innerHeight * 0.6))
    for (let y = 0; y < document.documentElement.scrollHeight && Date.now() - t0 < 25000; y += step) { scrollTo(0, y); await wait(250) }
    scrollTo(0, document.documentElement.scrollHeight); await wait(500)
    eager()
    await cap(Promise.all([...document.images].map((img) => (img.complete && img.naturalWidth ? null : img.decode().catch(() => {})))), 8000)
    scrollTo(0, 0)
    let last = -1
    for (let i = 0; i < 20; i++) {
      const h = document.documentElement.scrollHeight
      if (h === last) break
      last = h
      await wait(300)
    }
    await wait(1000) // entrance animations of the first sections, started again by the scroll back up
  })
  await dismissConsent(page) // a banner that came in late
}

async function capturePage(browser, out, entry, vps, tiles, opts = {}) {
  const [url, idOverride] = entry.split('|')   // `url|id` names the page's id (a clone whose paths differ from the original's)
  const id = idOverride || idOf(url); const rec = { id, url, viewports: {} }
  const log = opts.log || console.log
  let structure = null; const pictures = new Set()
  try { writeFileSync(join(out, `${id}.html`), await (await fetch(url, { headers: { 'user-agent': UA } })).text()) } catch {}
  for (const w of vps) {
    let ctx = await newCaptureContext(browser, w, opts)
    let page = await ctx.newPage(), scale = 1
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(() => {})
      const inner = await page.evaluate(() => innerWidth).catch(() => w)
      if (w < PHONE_WIDTH && inner > 0 && inner < w - 4) {
        // the mobile page lays itself out narrower than the phone and the phone zooms it to fit: photograph it the same way
        await ctx.close(); scale = w / inner
        ctx = await newCaptureContext(browser, w, { ...opts, scale }); page = await ctx.newPage()
        await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(() => {})
      }
      await settle(page).catch(() => {})
      const layout = await page.evaluate(extractInPage)
      writeFileSync(join(out, `${id}-${w}.layout.json`), JSON.stringify({ viewport: w, ...layout }))
      writeFileSync(join(out, `${id}-${w}.style.json`), JSON.stringify({ ...(await page.evaluate(extractStyleInPage)), ...(scale !== 1 ? { scale: +scale.toFixed(4) } : {}) }, null, 1))
      if (!structure) structure = await page.evaluate(extractStructure)
      for (const img of layout.images) if (/^https?:/.test(img.src)) pictures.add(img.src)
      await page.screenshot({ path: join(out, `${id}-${w}.jpg`), fullPage: true, type: 'jpeg', quality: 80, animations: 'disabled' })
      rec.viewports[w] = { ...layout.counts, scrollWidth: layout.doc.w, ...(scale !== 1 ? { scale: +scale.toFixed(4) } : {}) }
      if (tiles) makeTiles(join(out, `${id}-${w}.jpg`), join(out, 'small'), `${id}-${w}`, w)
    } catch (e) { rec.viewports[w] = { error: String(e).slice(0, 120) } }
    await ctx.close()
  }
  if (structure) writeFileSync(join(out, `${id}.json`), JSON.stringify({ id, url, ...structure, pictures: [...pictures].map((src) => ({ src, file: null })) }, null, 1))
  log(id, JSON.stringify(rec.viewports))
  return rec
}

/**
 * Pages are independent, so `jobs` of them are captured at once (default 4); capture.json keeps the order of the list.
 * Then the pictures are downloaded (unless `opts.pictures === false`). `opts.chromium`: a playwright chromium to launch.
 */
export async function capture(out, urls, vps, tiles, jobs = 4, opts = {}) {
  mkdirSync(out, { recursive: true })
  const browser = await launch(out, opts.chromium)
  const index = new Array(urls.length)
  let next = 0
  const worker = async () => { while (next < urls.length) { const i = next++; index[i] = await capturePage(browser, out, urls[i], vps, tiles, opts) } }
  await Promise.all(Array.from({ length: Math.min(jobs, urls.length) }, worker))
  await browser.close()
  writeFileSync(join(out, 'capture.json'), JSON.stringify(index, null, 1))
  const got = opts.pictures === false ? null : await downloadPictures(out, opts)
  return { pages: index, pictures: got }
}

/** The `<id>.json` page files of a capture (not its layout, style or run files). */
const pageFiles = (out) => readdirSync(out).filter((f) => f.endsWith('.json') && !/-\d+\.(layout|style)\.json$/.test(f) && f !== 'capture.json' && f !== 'map.json')

/**
 * Download every picture the capture listed into <out>/pictures/, named after the address and a short hash. Each
 * `<id>.json` gets `file` (relative to <out>) per picture; pictures/index.json maps address -> file and pages.
 * A picture already downloaded is kept. Returns counts.
 */
export async function downloadPictures(out, { log = console.log, jobs = 6 } = {}) {
  const dir = join(out, 'pictures'); mkdirSync(dir, { recursive: true })
  const indexFile = join(dir, 'index.json')
  let index = {}; try { index = JSON.parse(readFileSync(indexFile, 'utf8')) } catch {}
  const pagesOf = new Map()
  const docs = []
  for (const f of pageFiles(out)) {
    let doc; try { doc = JSON.parse(readFileSync(join(out, f), 'utf8')) } catch { continue }
    if (!doc || !Array.isArray(doc.pictures)) continue
    docs.push([f, doc])
    for (const p of doc.pictures) { const src = typeof p === 'string' ? p : p?.src; if (src) pagesOf.set(src, [...(pagesOf.get(src) || []), doc.id]) }
  }
  const nameOf = (src) => {
    const u = new URL(src); const hash = createHash('sha1').update(src).digest('hex').slice(0, 8)
    // Wix serves /media/<name>/v1/fill/.../<name>: the media name is the useful one
    const part = (u.pathname.match(/\/media\/([^/]+)/) || [])[1] || basename(u.pathname) || 'picture'
    const ext = extname(part).toLowerCase()
    return `${part.replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '-').slice(0, 60)}-${hash}${/^\.(jpe?g|png|gif|webp|avif|svg)$/.test(ext) ? ext : ''}`
  }
  const extFor = (type) => ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg' })[(type || '').split(';')[0].trim()] || ''
  const todo = [...pagesOf.keys()].filter((src) => !(index[src]?.file && existsSync(join(out, index[src].file))))
  let failed = 0, next = 0
  const worker = async () => {
    while (next < todo.length) {
      const src = todo[next++]
      try {
        const r = await fetch(src, { headers: { 'user-agent': UA } })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        let name = nameOf(src); if (!extname(name)) name += extFor(r.headers.get('content-type'))
        writeFileSync(join(dir, name), Buffer.from(await r.arrayBuffer()))
        index[src] = { file: `pictures/${name}` }
      } catch (e) { failed++; log(`picture not downloaded: ${src.slice(0, 120)} (${String(e.message || e).slice(0, 60)})`) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker))
  for (const [src, pagesList] of pagesOf) if (index[src]) index[src].pages = [...new Set(pagesList)]
  writeFileSync(indexFile, JSON.stringify(index, null, 1))
  for (const [f, doc] of docs) {
    doc.pictures = doc.pictures.map((p) => { const src = typeof p === 'string' ? p : p.src; return { src, file: index[src]?.file ?? null } })
    writeFileSync(join(out, f), JSON.stringify(doc, null, 1))
  }
  const downloaded = Object.values(index).filter((v) => v.file).length
  return { listed: pagesOf.size, downloaded, failed, dir }
}

/** Agent-sized copies: about 768 px wide (390 for a phone), cut into tiles about 1024 px tall: each costs roughly 1000 image tokens or less. */
function makeTiles(png, dir, name, w) {
  mkdirSync(dir, { recursive: true })
  const width = w <= 600 ? 390 : 768
  sh('convert', [png, '-resize', `${width}x`, '-crop', `${width}x1024`, '+repage', '-quality', '80', join(dir, `${name}-%d.jpg`)])
}

// ---------------------------------------------------------------- compare (section by section)
const pct = (x) => `${Math.round(x * 100)}%`
const sideOf = (band) => (band.images[0] ? band.images[0].side : 'none')
const bandDesc = (b) => `${b.cols} column${b.cols === 1 ? '' : 's'}${b.images.length ? `, ${b.images.length} picture${b.images.length === 1 ? '' : 's'} (${b.images.map((i) => `${pct(i.w)} wide, ${i.side}`).join('; ')})` : ''}${b.fullBleed ? ', full-width picture' : ''}`
/** Align the reference's sections with yours in order (dynamic programming on how alike two sections are), then list the biggest differences. */
export function sectionDiff(ref, mine) {
  const A = ref.bands, B = mine.bands
  const alike = (a, b) => 0.5 * (a.cols === b.cols ? 1 : Math.min(a.cols, b.cols) / Math.max(a.cols, b.cols)) + 0.3 * (a.images.length === b.images.length ? 1 : Math.min(a.images.length, b.images.length) / Math.max(a.images.length, b.images.length, 1)) + 0.2 * (sideOf(a) === sideOf(b) ? 1 : 0)
  const n = A.length, m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)), from = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) { const d = dp[i - 1][j - 1] + alike(A[i - 1], B[j - 1]); const u = dp[i - 1][j], l = dp[i][j - 1]; if (d >= u && d >= l) { dp[i][j] = d; from[i][j] = 0 } else if (u >= l) { dp[i][j] = u; from[i][j] = 1 } else { dp[i][j] = l; from[i][j] = 2 } }
  const pairs = []; let i = n, j = m
  while (i > 0 && j > 0) { if (from[i][j] === 0) { pairs.push([i - 1, j - 1]); i--; j-- } else if (from[i][j] === 1) i--; else j-- }
  pairs.reverse()
  const matched = new Set(pairs.map((p) => p[0])), notes = []
  for (const [ia, ib] of pairs) {
    const a = A[ia], b = B[ib], sc = alike(a, b)
    if (sc < 0.85) notes.push({ weight: 1 - sc, text: `section ${ia + 1} of ${n} (${pct(a.y0)}-${pct(a.y1)} down the page): original has ${bandDesc(a)}; yours (section ${ib + 1}) has ${bandDesc(b)}` })
    const ai = a.images[0], bi = b.images[0]
    if (ai && bi && Math.abs(ai.w - bi.w) > 0.12) notes.push({ weight: 0.4, text: `section ${ia + 1}: the picture is ${pct(ai.w)} of the page width in the original, ${pct(bi.w)} in yours` })
  }
  for (let k = 0; k < n; k++) if (!matched.has(k)) notes.push({ weight: 0.9, text: `section ${k + 1} of the original (${bandDesc(A[k])}) has no counterpart in your page` })
  if (m > pairs.length) notes.push({ weight: 0.5, text: `your page has ${m - pairs.length} section(s) the original does not have` })
  const hr = mine.doc.h / ref.doc.h
  if (hr < 0.85 || hr > 1.15) notes.push({ weight: Math.min(1, Math.abs(1 - hr)), text: `page height: original ${ref.doc.h} px, yours ${mine.doc.h} px (${hr.toFixed(2)}x): ${hr > 1 ? 'too much space or a layout that is too narrow/too stacked' : 'content missing or too compact'}` })
  const rm = ref.counts.multiColumnSections, mm = mine.counts.multiColumnSections
  if (rm !== mm) notes.push({ weight: 0.7, text: `multi-column sections: original ${rm}, yours ${mm}` })
  const score = n ? dp[n][m] / Math.max(n, m) : 1
  return { match: +(score * 0.7 + 0.3 * Math.min(hr, 1 / hr)).toFixed(2), notes: notes.sort((x, y) => y.weight - x.weight).slice(0, 6).map((x) => x.text) }
}
function compare(refDir, mineDir, only, width) {
  const files = readdirSync(refDir).filter((x) => /-\d+\.layout\.json$/.test(x)).sort()
  for (const f of files) {
    const [, id, vp] = f.match(/^(.*)-(\d+)\.layout\.json$/)
    if ((only && id !== only) || (width && +vp !== +width)) continue
    const mp = join(mineDir, f)
    if (!existsSync(mp)) { if (only) console.log(`${id} @${vp}: not captured yet in ${mineDir}`); continue }
    const d = sectionDiff(JSON.parse(readFileSync(join(refDir, f))), JSON.parse(readFileSync(mp)))
    console.log(`${id} @${vp}: match ${d.match}${d.notes.length ? '\n  - ' + d.notes.join('\n  - ') : '  (sections line up)'}`)
  }
}

// ---------------------------------------------------------------- check (does the site work as a whole)
async function check(base, refDir) {
  const ids = readdirSync(refDir).filter((x) => /\.layout\.json$/.test(x)).map((x) => x.replace(/-\d+\.layout\.json$/, '')).filter((v, i, a) => a.indexOf(v) === i)
  const pageUrl = (id) => { try { return JSON.parse(readFileSync(join(refDir, `${id}.json`))).url } catch { return null } }
  const bad = []
  for (const id of ids) {
    const orig = pageUrl(id); const path = orig ? new URL(orig).pathname : id === 'index' ? '/' : `/${id}`
    let status = 0, text = '', links = []
    try { const r = await fetch(base + path, { headers: { 'user-agent': UA }, redirect: 'follow' }); status = r.status; const html = await r.text(); text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); links = [...html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)"/g)].map((m) => m[1]) } catch {}
    const problems = []
    if (status !== 200) problems.push(`status ${status}`)
    if (status === 200 && text.length < 200) problems.push(`only ${text.length} characters of text in the server-rendered HTML (blank or loaded by script)`)
    const broken = []
    for (const l of [...new Set(links)].slice(0, 40)) { try { const r = await fetch(base + l, { method: 'GET', redirect: 'follow' }); if (r.status >= 400) broken.push(`${l} (${r.status})`) } catch { broken.push(l) } }
    if (broken.length) problems.push(`broken links: ${broken.slice(0, 5).join(', ')}`)
    console.log(`${id.padEnd(30)} ${path.padEnd(34)} ${problems.length ? 'PROBLEM: ' + problems.join('; ') : 'ok'}`)
    if (problems.length) bad.push(id)
  }
  console.log(`${ids.length - bad.length} of ${ids.length} pages ok${bad.length ? `; fix: ${bad.join(', ')}` : ''}`)
}

// ---------------------------------------------------------------- browser audit: horizontal overflow, broken pictures, script errors
async function auditPage(browser, base, path, widths) {
  const problems = []
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, userAgent: UA })
    const page = await ctx.newPage(); const bad = new Set(), errs = []
    page.on('response', (r) => { if (r.request().resourceType() === 'image' && r.status() >= 400) bad.add(`${r.status()} ${r.url().slice(0, 100)}`) })
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)))
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(500)
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 900) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)) })
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => (i.currentSrc || i.src).slice(0, 100)) }))
      if (r.sw > w + 4) problems.push(`${w}px: horizontal overflow (page is ${r.sw}px wide)`)
      for (const b of r.broken.slice(0, 3)) problems.push(`${w}px: broken picture ${b}`)
      for (const b of [...bad].slice(0, 3)) problems.push(`${w}px: picture request failed ${b}`)
      for (const e of errs.slice(0, 2)) problems.push(`${w}px: script error ${e}`)
    } catch (e) { problems.push(`${w}px: did not load (${String(e).slice(0, 60)})`) }
    await ctx.close()
  }
  return problems
}
async function audit(base, refDir, only, all) {
  const ids = readdirSync(refDir).filter((x) => /\.layout\.json$/.test(x)).map((x) => x.replace(/-\d+\.layout\.json$/, '')).filter((v, i, a) => a.indexOf(v) === i)
  const pathOf = (id) => { try { return new URL(JSON.parse(readFileSync(join(refDir, `${id}.json`))).url).pathname } catch { return id === 'index' ? '/' : `/${id}` } }
  const todo = all ? ids : [only]
  const browser = await launch(resolve('.site-audit')); let bad = 0, next = 0
  const worker = async () => { while (next < todo.length) { const id = todo[next++]; const p = await auditPage(browser, base, pathOf(id), [390, 1440, 1920]); if (p.length) { bad++; console.log(`${id} (${pathOf(id)})\n  - ${p.join('\n  - ')}`) } } }
  await Promise.all(Array.from({ length: all ? 4 : 1 }, worker))
  await browser.close()
  console.log(`${todo.length - bad} of ${todo.length} page(s) clean at 390 / 1440 / 1920 px`)
}

// ---------------------------------------------------------------- cli
const [cmd, ...rest] = process.argv.slice(2)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (cmd === 'pages') console.log((await pages(rest[0])).join('\n'))
  else if (cmd === 'pictures') console.log(JSON.stringify(await downloadPictures(rest[0])))
  else if (cmd === 'capture') {
    const out = rest.shift(); let vps = [1440, 390, 1920], tiles = false, jobs = 4, urls = []
    while (rest.length) { const a = rest.shift(); if (a === '--viewports') vps = rest.shift().split(',').map(Number); else if (a === '--tiles') tiles = true; else if (a === '--jobs') jobs = Math.max(1, Number(rest.shift()) || 4); else if (a.startsWith('@')) urls.push(...readFileSync(a.slice(1), 'utf8').split(/\s+/).filter(Boolean)); else urls.push(a) }
    await capture(out, urls, vps, tiles, jobs)
  } else if (cmd === 'compare') {
    let only = null, width = null; const pos = []
    for (let k = 0; k < rest.length; k++) { if (rest[k] === '--page') only = rest[++k]; else if (rest[k] === '--width') width = rest[++k]; else pos.push(rest[k]) }
    compare(pos[0], pos[1], only, width)
  } else if (cmd === 'shot') {
    const out = rest[0], url = rest[1]; const w = rest.includes('--width') ? Number(rest[rest.indexOf('--width') + 1]) : 1440
    await capture(out, [url], [w], true, 1, { pictures: false })
  } else if (cmd === 'check') {
    const only = rest.includes('--page') ? rest[rest.indexOf('--page') + 1] : null, all = rest.includes('--all')
    if (only || all) await audit(rest[0], rest[1], only, all); else await check(rest[0], rest[1])
  }
  else console.log('usage (out-dir/reference-dir: artifacts/references/<site>): pages <root-url> | pictures <out-dir> | capture <out-dir> [--viewports 1440,390,1920] [--tiles] <url|@file>... | shot <out-dir> <url> [--width 1440] | compare <reference-dir> <clone-dir> [--page id] [--width 1440] | check <base-url> <reference-dir> [--page id | --all]')
}
