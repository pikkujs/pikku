#!/usr/bin/env node
// site_capture.mjs: capture and compare the reference of a website you are cloning, from the RENDERED page.
//   node site_capture.mjs pages <root-url>                          page list: sitemap(s), else internal links
//   node site_capture.mjs capture <out-dir> [--viewports 1440,390,1920] [--tiles] <url|@file-with-urls> ...
//   node site_capture.mjs shot <out-dir> <url> [--width 1440]       one page, one width: screenshot + tiles, quick (use after each change)
//   node site_capture.mjs compare <reference-dir> <clone-dir> [--page id] [--width 1440]
//                                                                   section-by-section differences (columns, pictures, height) and a match score
//   node site_capture.mjs check <base-url> <reference-dir>          every page answers 200, has its content in the server-rendered HTML, no console errors, links resolve
// Needs a Chromium and playwright-core: PIKKU_CHROMIUM = path of the chrome binary, PLAYWRIGHT_CORE = path of the playwright-core
// module (default: `playwright-core` resolved from the current directory). Browser profile, tmp and downloads stay under <out-dir>/.browser.
// Tiles and pixel scores use ImageMagick (`convert`, `compare`) when it is installed.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { return String(e.stderr || '') + String(e.stdout || '') } }
const idOf = (url) => { const p = new URL(url).pathname.replace(/^\/+|\/+$/g, ''); return p ? p.replace(/\//g, '__') : 'index' }
const UA = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// ---------------------------------------------------------------- pages
async function pages(root) {
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
  console.log(out.join('\n'))
}

// ---------------------------------------------------------------- in-page extraction (runs in the browser)
function extractInPage() {
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
async function launch(out) {
  const require = createRequire(resolve('.') + '/')
  const pw = require(process.env.PLAYWRIGHT_CORE ? resolve(process.env.PLAYWRIGHT_CORE) : 'playwright-core')
  const home = resolve(out, '.browser'); mkdirSync(join(home, 'tmp'), { recursive: true })
  return pw.chromium.launch({
    executablePath: process.env.PIKKU_CHROMIUM || undefined, headless: true, downloadsPath: join(home, 'downloads'),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    env: { ...process.env, HOME: home, TMPDIR: join(home, 'tmp'), XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache') },
  })
}

async function capture(out, urls, vps, tiles) {
  mkdirSync(out, { recursive: true })
  const browser = await launch(out)
  const index = []
  for (const entry of urls) {
    const [url, idOverride] = entry.split('|')   // `url|id` names the page's id (a clone whose paths differ from the original's)
    const id = idOverride || idOf(url); const rec = { id, url, viewports: {} }
    try { writeFileSync(join(out, `${id}.html`), await (await fetch(url, { headers: { 'user-agent': UA } })).text()) } catch {}
    for (const w of vps) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, userAgent: UA, deviceScaleFactor: 1, isMobile: w < 600 })
      const page = await ctx.newPage()
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {})
        // scroll through the page so lazy pictures load, then back to the top
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400)) })
        const layout = await page.evaluate(extractInPage)
        writeFileSync(join(out, `${id}-${w}.layout.json`), JSON.stringify({ viewport: w, ...layout }))
        if (w === vps[0]) writeFileSync(join(out, `${id}.json`), JSON.stringify({ id, url, ...(await page.evaluate(extractStructure)) }, null, 1))
        await page.screenshot({ path: join(out, `${id}-${w}.png`), fullPage: true })
        rec.viewports[w] = layout.counts
        if (tiles) makeTiles(join(out, `${id}-${w}.png`), join(out, 'small'), `${id}-${w}`, w)
      } catch (e) { rec.viewports[w] = { error: String(e).slice(0, 120) } }
      await ctx.close()
    }
    index.push(rec); console.log(id, JSON.stringify(rec.viewports))
  }
  await browser.close()
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1))
}

/** Agent-sized copies: about 768 px wide (390 for a phone), cut into tiles about 1024 px tall: each costs roughly 1000 image tokens or less. */
function makeTiles(png, dir, name, w) {
  mkdirSync(dir, { recursive: true })
  const width = w <= 600 ? 390 : 768
  sh('convert', [png, '-resize', `${width}x`, '-crop', `${width}x1024`, '+repage', join(dir, `${name}-%d.png`)])
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

// ---------------------------------------------------------------- cli
const [cmd, ...rest] = process.argv.slice(2)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (cmd === 'pages') await pages(rest[0])
  else if (cmd === 'capture') {
    const out = rest.shift(); let vps = [1440, 390, 1920], tiles = false, urls = []
    while (rest.length) { const a = rest.shift(); if (a === '--viewports') vps = rest.shift().split(',').map(Number); else if (a === '--tiles') tiles = true; else if (a.startsWith('@')) urls.push(...readFileSync(a.slice(1), 'utf8').split(/\s+/).filter(Boolean)); else urls.push(a) }
    await capture(out, urls, vps, tiles)
  } else if (cmd === 'compare') {
    let only = null, width = null; const pos = []
    for (let k = 0; k < rest.length; k++) { if (rest[k] === '--page') only = rest[++k]; else if (rest[k] === '--width') width = rest[++k]; else pos.push(rest[k]) }
    compare(pos[0], pos[1], only, width)
  } else if (cmd === 'shot') {
    const out = rest[0], url = rest[1]; const w = rest.includes('--width') ? Number(rest[rest.indexOf('--width') + 1]) : 1440
    await capture(out, [url], [w], true)
  } else if (cmd === 'check') await check(rest[0], rest[1])
  else console.log('usage: pages <root-url> | capture <out-dir> [--viewports 1440,390,1920] [--tiles] <url|@file>... | shot <out-dir> <url> [--width 1440] | compare <reference-dir> <clone-dir> [--page id] [--width 1440] | check <base-url> <reference-dir>')
}
