#!/usr/bin/env node
/**
 * Shoot one side of a parity contact sheet.
 *
 *   node crawl.mjs --config shoot.json --side a --out shots/live
 *   node crawl.mjs --config shoot.json --side b --out shots/rebuild --workers 4
 *
 * Writes `<out>/<id>.<viewport>.png` plus a `manifest.tsv` row per capture, and
 * appends to a shared manifest rather than replacing it, so a partial re-shoot
 * can be merged. Run it once per side; `measure.mjs --manifest` pairs them up
 * afterwards and `contact-sheet.mjs` builds the page.
 *
 * CREDENTIALS ARE NEVER READ FROM THE CONFIG. They come from the environment,
 * or from a prompt with the terminal echo off, and are never written to the
 * manifest, a filename, a log line or anything this script leaves on disk. A
 * password pasted into a JSON file is a password in the user's shell history, in
 * their editor's undo buffer, and one `git add .` away from being permanent.
 *
 * ------------------------------------------------------------------ config
 * {
 *   "sides": {
 *     "a": { "baseUrl": "https://app.example.com", "auth": { "kind": "form",
 *              "path": "/login", "user": "#email", "pass": "#password",
 *              "submit": "button[type=submit]", "settled": "[data-app-ready]" } },
 *     "b": { "baseUrl": "http://localhost:7110", "auth": { "kind": "none" } }
 *   },
 *   "viewports": [ { "id": "desktop", "label": "Desktop 1440", "width": 1440, "height": 900 },
 *                  { "id": "phone",   "label": "Phone 390",   "width": 390, "height": 844,
 *                    "mobile": true, "deviceScaleFactor": 2 } ],
 *   "screens": [ { "id": "dashboard", "routes": { "a": "/dashboard", "b": "/app/dashboard" } },
 *                { "id": "product-new", "routes": { "a": "/products", "b": "/app/products" },
 *                  "open": ["[data-testid=new-product]"], "settled": "role=dialog" } ]
 * }
 *
 * `open` is a list of selectors clicked in order after the screen settles, which
 * is how a dialog, a menu or a row action becomes its own screen. Each entry may
 * be a comma-separated union: openers move, and a union that polls beats a single
 * synchronous look at one selector.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const argv = process.argv.slice(2)
const flag = (n, d = null) => {
  const i = argv.indexOf(n)
  return i === -1 ? d : argv[i + 1]
}
const has = (n) => argv.includes(n)

const configPath = flag('--config')
const side = flag('--side', 'a')
const outDir = flag('--out', `shots/${side}`)
const workers = Number(flag('--workers', 1))
const only = flag('--only') // comma-separated screen ids, for a re-shoot
if (!configPath) {
  console.error('usage: crawl.mjs --config <shoot.json> --side <a|b> --out <dir> [--workers n] [--only id,id]')
  process.exit(2)
}

const config = JSON.parse(readFileSync(configPath, 'utf8'))
const sideCfg = config.sides?.[side]
if (!sideCfg) {
  console.error(`config has no sides.${side}`)
  process.exit(2)
}

/* ------------------------------------------------------- credential intake */

/**
 * Read a secret without it appearing anywhere.
 *
 * Environment first, because that is what CI and a `set -a && . ./.env` shell
 * already have; a TTY prompt with echo off second, because a human running this
 * by hand should not have to put the password on the command line where it lands
 * in shell history and in `ps`. There is deliberately no third option.
 */
async function secret(label, envName) {
  if (process.env[envName]) return process.env[envName]
  if (!process.stdin.isTTY) {
    console.error(
      `${envName} is not set and there is no terminal to ask on.\n` +
        `Export it for this command only, e.g.  ${envName}='...' node crawl.mjs ...`,
    )
    process.exit(2)
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true })
  // Suppress echo: the readline output stream is told to write nothing while the
  // answer is being typed, so the secret never reaches the scrollback.
  const onData = (char) => {
    if (['\n', '\r', ''].includes(String(char))) return
    process.stderr.write('')
  }
  rl.output.write(`${label}: `)
  const muted = true
  rl._writeToOutput = function (s) {
    if (muted && !s.startsWith(label)) return
    rl.output.write(s)
  }
  process.stdin.on('data', onData)
  const answer = await new Promise((res) => rl.question('', res))
  process.stdin.off('data', onData)
  rl.close()
  process.stderr.write('\n')
  return answer
}

async function askViewports() {
  if (config.viewports?.length) return config.viewports
  // The user picks the widths. A sheet shot at one width is a claim about one
  // width, and a rebuild that matches at 1440 and collapses at 390 has not
  // matched — so ask rather than assume, and put the answer in the config.
  if (!process.stdin.isTTY) {
    console.error('config.viewports is missing and there is no terminal to ask on.')
    process.exit(2)
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  const ans = await new Promise((res) =>
    rl.question('Viewport widths to capture, comma separated [1440,390]: ', res),
  )
  rl.close()
  const widths = (ans.trim() || '1440,390').split(',').map((w) => Number(w.trim())).filter(Boolean)
  return widths.map((w) => ({
    id: w >= 1024 ? 'desktop' : w >= 700 ? 'tablet' : 'phone',
    label: `${w >= 1024 ? 'Desktop' : w >= 700 ? 'Tablet' : 'Phone'} ${w}`,
    width: w,
    height: w >= 1024 ? 900 : 844,
    mobile: w < 700,
    deviceScaleFactor: 1,
  }))
}

/* ------------------------------------------------------------------ browser */

const { chromium } = await import('playwright')

const viewports = await askViewports()
const screens = (config.screens ?? []).filter((s) => !only || only.split(',').includes(s.id))
mkdirSync(outDir, { recursive: true })
const manifestPath = join(outDir, 'manifest.tsv')
if (!existsSync(manifestPath)) {
  writeFileSync(manifestPath, '# id\tviewport\tside\troute\turl\tfile\tiso\n')
}

/**
 * Wait for the SCREEN, not for the clock.
 *
 * A blind sleep works with one browser and fails the moment there are four on
 * one dev server: the openers have not rendered yet and every failure reads like
 * a missing component. Loader gone, then network quiet, then a short settle for
 * the things that decode after the loader disappears (remote background images
 * are the usual culprit; shot too early they come back white and read as a
 * styling bug).
 */
async function settle(page, selector) {
  if (sideCfg.loader) {
    await page.waitForSelector(sideCfg.loader, { state: 'detached', timeout: 30_000 }).catch(() => {})
  }
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  if (selector) await page.waitForSelector(selector, { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 700))
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => i.decode().catch(() => {})))
    if (document.fonts?.ready) await document.fonts.ready
  })
}

/**
 * Click something that only exists on hover.
 *
 * A row kebab held at `visibility: hidden` until its row is hovered can never be
 * reached by locator.click, which refuses an invisible target. Read the box and
 * drive the mouse to its centre instead.
 */
async function clickMaybeHidden(page, selector) {
  const union = selector.split(',').map((s) => s.trim())
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const one of union) {
      const box = await page
        .evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const r = el.getBoundingClientRect()
          return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
        }, one)
        .catch(() => null)
      if (box) {
        await page.mouse.move(box.x, box.y)
        await page.mouse.click(box.x, box.y)
        return true
      }
    }
    await page.waitForTimeout(250)
  }
  throw new Error(`no opener matched: ${selector}`)
}

async function signIn(context) {
  const auth = sideCfg.auth ?? { kind: 'none' }
  if (auth.kind === 'none') return
  const page = await context.newPage()

  // Warm-up. A dev server restarted before a shoot compiles the login route on
  // the first request, which can outrun Playwright's 30s default: the fill times
  // out, the shooter dies at sign-in, and every later capture fails
  // unauthenticated with an error that says nothing about login.
  await page.goto(new URL(auth.path ?? '/login', sideCfg.baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 120_000 })

  if (auth.kind === 'form') {
    const user = process.env[`${side.toUpperCase()}_USER`] ?? (await secret(`${sideCfg.baseUrl} username`, `${side.toUpperCase()}_USER`))
    const pass = await secret(`${sideCfg.baseUrl} password`, `${side.toUpperCase()}_PASS`)
    await page.fill(auth.user, user)
    await page.fill(auth.pass, pass)
    await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.click(auth.submit)])
  } else if (auth.kind === 'token') {
    // A derived or issued token posted from inside the page, so the cookie the
    // app actually uses is the one set — rather than a header this script
    // invents that no later navigation carries.
    const token = await secret(`${sideCfg.baseUrl} token`, `${side.toUpperCase()}_TOKEN`)
    await page.evaluate(
      async ({ endpoint, body, token }) => {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...body, secret: token }),
        })
      },
      { endpoint: auth.endpoint, body: auth.body ?? {}, token },
    )
  } else {
    throw new Error(`unknown auth.kind: ${auth.kind}`)
  }
  await settle(page, auth.settled)
  await page.close()
}

async function shoot(context, screen, vp) {
  const route = screen.routes?.[side]
  if (!route) return null
  const page = await context.newPage()
  const url = new URL(route, sideCfg.baseUrl).href
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await settle(page, screen.settled && !screen.open ? screen.settled : sideCfg.settled)

  for (const opener of screen.open ?? []) await clickMaybeHidden(page, opener)
  if (screen.open?.length) await settle(page, screen.settled)

  const file = join(outDir, `${screen.id}.${vp.id}.png`)
  await page.screenshot({ path: file, fullPage: screen.fullPage !== false })

  // Provenance. A stale shot under a right-looking filename is the one failure a
  // contact sheet structurally cannot show you: it looks like a pass. Record the
  // URL the browser actually ended on (not the one we asked for, so a silent
  // redirect is visible) and when.
  const landed = page.url()
  await page.close()
  appendFileSync(
    manifestPath,
    [screen.id, vp.id, side, route, landed, file, new Date().toISOString()].join('\t') + '\n',
  )
  if (!landed.includes(route) && route !== '/') {
    console.error(`  ! ${screen.id}/${vp.id} redirected: asked ${route}, landed ${landed}`)
  }
  return file
}

const browser = await chromium.launch()
let failures = 0

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height ?? 900 },
    deviceScaleFactor: vp.deviceScaleFactor ?? 1,
    isMobile: vp.mobile ?? false,
    hasTouch: vp.mobile ?? false,
    // A phone-width capture with touch emulation off silently renders the
    // desktop navigation on any layout that keys off pointer type.
  })
  await signIn(context)

  // Round-robin, not contiguous blocks. The slow captures cluster together (a
  // ledger's sort, view and row-menu variants sit next to each other), so a block
  // split hands one worker all of them and the other three finish early.
  const lanes = Array.from({ length: Math.max(1, workers) }, (_, i) => screens.filter((_, j) => j % workers === i))
  await Promise.all(
    lanes.map(async (lane) => {
      for (const screen of lane) {
        try {
          await shoot(context, screen, vp)
          process.stderr.write(`  ${screen.id}.${vp.id}\n`)
        } catch (err) {
          failures++
          console.error(`  FAILED ${screen.id}.${vp.id}: ${err.message}`)
        }
      }
    }),
  )
  await context.close()
}

await browser.close()
console.error(`\n${screens.length * viewports.length - failures} captures written to ${outDir}, ${failures} failed`)
process.exitCode = failures ? 1 : 0
