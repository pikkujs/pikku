import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { readKnowledgeNotes } from '@pikku/knowledge'
import { criticArgs, resolvePi, type BuilderAi } from './pi.js'
import { UI_CRITIQUE_RUBRIC } from './rubric.js'
import type { Launcher } from './session.js'
import type { CommandRunner } from './loop.js'

export interface LookFinding {
  severity: 'high' | 'medium' | 'low'
  issue: string
  fix: string
}

export interface Critique {
  verdict: 'pass' | 'fix' | 'ungraded'
  findings: LookFinding[]
}

export interface PageLook extends Critique {
  route: string
  shots: string[]
}

export type Critic = (input: { route: string; shots: string[]; about: string | null }) => Promise<Critique>

export interface LookOptions {
  apps: { slug: string; url: string }[]
  onStatus?: (text: string) => void
  persona?: string
  milestone: string
  run: CommandRunner
  env?: Record<string, string>
  critic: Critic
}

interface Shot {
  path: string
  file: string | null
  httpStatus: number | null
  error?: string
  problems: string[]
}

interface Ledger {
  milestone: string
  routes: Record<string, { hash: string } & Critique>
}

const PHONE = { E2E_VIEWPORT_WIDTH: '390', E2E_VIEWPORT_HEIGHT: '844' }

const lastJson = (output: string): any => {
  const line = output
    .trim()
    .split('\n')
    .reverse()
    .find((l) => l.trim().startsWith('{'))
  if (!line) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

export function parseCritique(text: string): Critique {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { verdict: 'ungraded', findings: [] }
  try {
    const raw = JSON.parse(match[0])
    const findings: LookFinding[] = Array.isArray(raw.findings)
      ? raw.findings
          .filter((f: any) => f && typeof f.issue === 'string')
          .map((f: any) => ({
            severity: ['high', 'medium', 'low'].includes(String(f.severity).toLowerCase()) ? String(f.severity).toLowerCase() : 'medium',
            issue: f.issue,
            fix: typeof f.fix === 'string' ? f.fix : '',
          }))
      : []
    const verdict = raw.verdict === 'pass' || raw.verdict === 'fix' ? raw.verdict : findings.length ? 'fix' : 'pass'
    return { verdict, findings }
  } catch {
    return { verdict: 'ungraded', findings: [] }
  }
}

export async function appAbout(cwd: string): Promise<string | null> {
  try {
    const overview = (await readKnowledgeNotes(cwd)).find(
      (note) => String(note.type).toLowerCase() === 'overview' && !note.path.endsWith('knowledge/index.md')
    )
    if (!overview) return null
    return [overview.title, (overview as any).description].filter(Boolean).join(' — ') || null
  } catch {
    return null
  }
}

const hashFiles = (files: string[]) => {
  const hash = createHash('sha256')
  for (const file of files) if (existsSync(file)) hash.update(readFileSync(file))
  return hash.digest('hex')
}

const NO_BROWSER = /Executable doesn't exist|playwright install|Looks like Playwright/i
export const NO_DRIVER = /Screenshots need '/

const SYSTEM_BROWSERS: Record<string, string[]> = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}

export const systemBrowser = (): string | null => (SYSTEM_BROWSERS[process.platform] ?? []).find((path) => existsSync(path)) ?? null

const playwrightBin = (cwd: string): string | null => {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', '.bin', 'playwright')
    if (existsSync(bin)) return bin
    if (dirname(dir) === dir) return null
  }
}

const installBrowser = (cwd: string, bin: string) =>
  new Promise<boolean>((done) => {
    const child = spawn(bin, ['install', 'chromium', '--only-shell'], { cwd, stdio: 'ignore' })
    child.once('error', () => done(false))
    child.once('close', (code) => done(code === 0))
  })

async function ensureBrowser(cwd: string, options: LookOptions): Promise<boolean> {
  const chrome = systemBrowser()
  if (chrome && !options.env?.PLAYWRIGHT_CHROMIUM_PATH) {
    options.env = { ...options.env, PLAYWRIGHT_CHROMIUM_PATH: chrome }
    return true
  }
  const bin = playwrightBin(cwd)
  if (!bin) return false
  options.onStatus?.('Downloading a browser for the page checks (about 200 MB, once)')
  return installBrowser(cwd, bin)
}

async function photograph(cwd: string, options: LookOptions, app: { slug: string; url: string }, out: string, env: Record<string, string> = {}, retried = false): Promise<Shot[]> {
  const args = ['pages', 'screenshot', '--base-url', app.url, '--app', `apps/${app.slug}`, '--out', out, '--json']
  if (options.persona) args.push('--as', options.persona)
  const result = await options.run(cwd, args, { ...options.env, ...env })
  const parsed = lastJson(result.output)
  if (!parsed?.shots && !retried && NO_BROWSER.test(result.output) && (await ensureBrowser(cwd, options))) {
    return photograph(cwd, options, app, out, env, true)
  }
  if (!parsed?.shots) throw new Error(`Could not photograph ${app.slug}: ${result.output.trim().split('\n').slice(-6).join('\n')}`)
  return (parsed.shots as Shot[]).map((shot) => ({ ...shot, file: shot.file ? resolve(cwd, shot.file) : null }))
}

const broken = (shot: Shot): LookFinding | null => {
  if (shot.error || !shot.file) return { severity: 'high', issue: `The page did not load: ${shot.error ?? 'no image'}`, fix: 'Fix what stops the route rendering.' }
  if (shot.httpStatus && shot.httpStatus >= 500) return { severity: 'high', issue: `The page answered HTTP ${shot.httpStatus}`, fix: 'Fix the server error behind this route.' }
  const threw = shot.problems.filter((p) => p.startsWith('threw:') || p.startsWith('API '))
  if (threw.length) return { severity: 'high', issue: threw.join('; ').slice(0, 600), fix: 'Fix the error the page hit while rendering.' }
  return null
}

export async function lookAtPages(cwd: string, options: LookOptions): Promise<PageLook[]> {
  const root = join(cwd, '.pikku', 'builder')
  const ledgerPath = join(root, 'looks.json')
  let ledger: Ledger = { milestone: options.milestone, routes: {} }
  try {
    const saved = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger
    if (saved.milestone === options.milestone) ledger = saved
  } catch {}

  const about = await appAbout(cwd)
  const looks: PageLook[] = []
  for (const app of options.apps) {
    const dir = join(root, 'looks', app.slug)
    const desktop = await photograph(cwd, options, app, join(dir, 'desktop'))
    const phone = await photograph(cwd, options, app, join(dir, 'phone'), PHONE)
    const phoneFor = new Map(phone.map((shot) => [shot.path, shot]))
    const pending: Promise<void>[] = []
    for (const shot of desktop) {
      const route = options.apps.length > 1 ? `${app.slug}:${shot.path}` : shot.path
      const other = phoneFor.get(shot.path)
      const fault = broken(shot) ?? (other ? broken(other) : null)
      const shots = [shot.file, other?.file].filter((f): f is string => !!f)
      if (fault) {
        looks.push({ route, shots, verdict: 'fix', findings: [fault] })
        delete ledger.routes[route]
        continue
      }
      const hash = hashFiles(shots)
      const known = ledger.routes[route]
      const stillHigh = known?.findings.some((f) => f.severity === 'high')
      if (known && (known.hash === hash || (known.verdict === 'pass' && !stillHigh))) {
        looks.push({ route, shots, verdict: known.verdict, findings: known.findings })
        continue
      }
      pending.push(
        options.critic({ route, shots, about }).then((critique) => {
          if (critique.verdict !== 'ungraded') ledger.routes[route] = { hash, ...critique }
          looks.push({ route, shots, ...critique })
        })
      )
    }
    await Promise.all(pending)
  }
  await mkdir(root, { recursive: true })
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2))
  return looks.sort((a, b) => a.route.localeCompare(b.route))
}

export const lookReport = (looks: PageLook[]): string | null => {
  const failing = looks.filter((look) => look.findings.some((f) => f.severity === 'high'))
  if (failing.length === 0) return null
  return [
    `${failing.length} page(s) do not pass the look yet. Each was photographed at desktop and phone width and graded against the design rubric:`,
    ...failing.map((look) =>
      [
        `\n${look.route}`,
        ...look.findings.filter((f) => f.severity !== 'low').map((f) => `  - [${f.severity.toUpperCase()}] ${f.issue}${f.fix ? `\n    fix: ${f.fix}` : ''}`),
        `  screenshots: ${look.shots.join(', ')}`,
      ].join('\n')
    ),
    '\nFix the HIGH findings in the app itself. Never weaken the check. The pages are photographed again after your turn.',
  ].join('\n')
}

const CRITIC_SYSTEM = 'You are a senior product designer reviewing screenshots of one screen of a web app. Judge ONLY what is visible in the images. Answer with JSON only.'

export function piCritic({ ai, env = {}, launch, timeoutMs = 120_000 }: { ai?: BuilderAi; env?: Record<string, string>; launch: Launcher; timeoutMs?: number }): Critic {
  return ({ route, shots, about }) =>
    new Promise((done) => {
      const prompt = [
        UI_CRITIQUE_RUBRIC,
        '',
        about
          ? `About this app — ${about}.\nJudge register and colour scheme against THAT: work out what kind of thing it is and who opens it, then ask what suits IT, not what suits a generic web app.`
          : 'You have not been told what the app is, so do not guess at its register — judge only the checks the image alone can answer.',
        `These screenshots are the "${route}" screen: the first at desktop width, the second at a 390px phone width.`,
        'Return ONLY a JSON object: {"verdict":"pass"|"fix","findings":[{"severity":"high"|"medium"|"low","issue":"...","fix":"..."}]}',
      ].join('\n')
      const child = launch(process.execPath, [resolvePi(), ...criticArgs(ai, CRITIC_SYSTEM), ...shots.map((s) => `@${s}`), prompt], {
        cwd: dirname(shots[0]!),
        env: { ...process.env, ...env },
      })
      let output = ''
      const timer = setTimeout(() => child.kill(), timeoutMs)
      child.stdout?.on('data', (chunk) => (output += chunk))
      child.once('error', () => done({ verdict: 'ungraded', findings: [] }))
      child.once('close', () => {
        clearTimeout(timer)
        done(parseCritique(output))
      })
    })
}
