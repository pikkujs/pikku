import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import {
  defaultCompareDir,
  discoverPages,
  findWorkspaceRoot,
  readReference,
  routeExists,
  routeFor,
  type AppPage,
  type CompareRow,
  type ReferenceShot,
} from '@pikku/cli/addon-support/pages'

/**
 * The page gate on `pikku changes done`. A project rebuilt from a captured
 * original keeps its reference in `artifacts/references/<site>/`; a change
 * that touched one of the frontend's pages is not done until
 * `pikku ui pages compare` has photographed those pages at HEAD and each is
 * within the threshold of the original. Prompt text asking a model to compare
 * did not make it compare; a refusal does.
 *
 * `--waive "<reason>"` lets a phone width that cannot match through (the
 * reason goes in the done note); a page over the threshold at a desktop width
 * (1000 px or more) is refused even with a waiver, with its numbers and the
 * compare's style differences, so it gets fixed. PIKKU_COMPARE_GATE=off turns
 * the gate off for labs.
 *
 * In a clone project (see `isCloneProject`) the gate fails closed: a change
 * that touched pages is refused while the reference is not a capture made by
 * `pikku ui pages capture` (no screenshots, no style.json, or the original's
 * pictures not downloaded), with the command to run.
 */

export type Git = (args: string[]) => Promise<string>

export const DEFAULT_THRESHOLD = 40
export const MIN_WAIVER_LENGTH = 30
/** A waiver covers only widths under this: a desktop page has no excuse not to match. */
export const WAIVABLE_BELOW = 1000
export const REFERENCES_DIR = join('artifacts', 'references')
/** The archaeology notes of a site being rebuilt (the pikku-site-archaeology skill). */
export const SITE_NOTES = join('knowledge', 'site', 'index.md')

export type PageGateOutcome =
  | { kind: 'off' }
  | { kind: 'skip'; why: string }
  | { kind: 'waived'; reason: string; pages: string[] }
  | { kind: 'pass'; pages: string[] }
  | { kind: 'refuse'; message: string }

export interface PageGateInput {
  git: Git
  cwd?: string
  env?: NodeJS.ProcessEnv
  waive?: string
  /** For the refusal: `#12`. */
  label?: string
  discover?: (workspaceRoot: string) => Promise<AppPage[]>
  /**
   * The pages the change declared (the `Pages:` line its plan filed). The
   * change is held to exactly these, whatever files it touched: a shared
   * `$slug` route then answers for its own pages, not for every page.
   */
  pages?: string[]
}

interface Report {
  reference?: string
  gitSha?: string | null
  dirty?: boolean | null
  generatedAt?: string
  rows?: CompareRow[]
}

interface Site {
  name: string
  dir: string
  shots: ReferenceShot[]
  map: Record<string, string>
}

/** Each `artifacts/references/<site>/` holding at least one `<id>-<width>` screenshot. */
export function referenceSites(top: string): Site[] {
  const root = join(top, REFERENCES_DIR)
  if (!existsSync(root)) return []
  const sites: Site[] = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    if (!statSync(dir).isDirectory()) continue
    let shots: ReferenceShot[]
    try {
      shots = readReference(dir)
    } catch {
      continue
    }
    const mapFile = join(dir, 'map.json')
    let map: Record<string, string> = {}
    try {
      if (existsSync(mapFile)) map = JSON.parse(readFileSync(mapFile, 'utf8'))
    } catch {}
    sites.push({ name, dir, shots, map })
  }
  return sites
}

/**
 * A project rebuilding an existing site: it has a folder under
 * `artifacts/references/` or the archaeology notes `knowledge/site/index.md`.
 */
export function isCloneProject(top: string): boolean {
  if (existsSync(join(top, SITE_NOTES))) return true
  const root = join(top, REFERENCES_DIR)
  try {
    return readdirSync(root).some((name) =>
      statSync(join(root, name)).isDirectory()
    )
  } catch {
    return false
  }
}

/** The original's address: from the capture's `<id>.json` or pages.txt, else the archaeology notes, else the folder name. */
function originalUrl(top: string, site?: string): string {
  const dir = site ? join(top, REFERENCES_DIR, site) : null
  // the site's root: the capture starts from it and finds every page
  const first = (text: string) => {
    const found = text.match(/https?:\/\/[^\s)"'<>\]]+/)?.[0]
    return found ? `${new URL(found).origin}/` : undefined
  }
  if (dir) {
    for (const name of ['index.json', 'pages.txt']) {
      try {
        const found = first(readFileSync(join(dir, name), 'utf8'))
        if (found) return found
      } catch {}
    }
  }
  try {
    const found = first(readFileSync(join(top, SITE_NOTES), 'utf8'))
    if (found) return found
  } catch {}
  return site ? `https://${site}/` : '<url of the original>'
}

/**
 * Why the clone's reference is not one the gate can hold pages to, or null:
 * no screenshots, screenshots without a style.json (not made by the capture),
 * or pictures listed by the capture and none downloaded.
 */
export function referenceProblem(top: string, sites: Site[]): string | null {
  const root = join(top, REFERENCES_DIR)
  if (!sites.length) {
    let folders: string[] = []
    try {
      folders = readdirSync(root).filter((name) =>
        statSync(join(root, name)).isDirectory()
      )
    } catch {}
    const site = folders[0]
    return `There is no capture of the original: ${site ? `${join(REFERENCES_DIR, site)} has` : `${REFERENCES_DIR}/<site> holds`} no <id>-<width>.jpg|png screenshots.\nRun: pikku ui pages capture ${originalUrl(top, site)} --out ${join(REFERENCES_DIR, site ?? '<site>')}`
  }
  for (const site of sites) {
    const out = join(REFERENCES_DIR, site.name)
    const again = `Run: pikku ui pages capture ${originalUrl(top, site.name)} --out ${out}`
    if (!site.shots.some((shot) => shot.style))
      return `${out} was not made by pikku ui pages capture: it has no <id>-<width>.style.json (the original's colours and fonts), so a page cannot be held to the original.\n${again}`
    let listed = false
    for (const name of readdirSync(site.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const doc = JSON.parse(readFileSync(join(site.dir, name), 'utf8'))
        if (doc?.images?.length || doc?.pictures?.length) listed = true
      } catch {}
      if (listed) break
    }
    let downloaded = false
    try {
      downloaded = readdirSync(join(site.dir, 'pictures')).some(
        (name) => name !== 'index.json'
      )
    } catch {}
    if (listed && !downloaded)
      return `The original has pictures, and none were downloaded into ${join(out, 'pictures')}: the clone cannot show them.\n${again}`
  }
  return null
}

/** The nearest pikku.config.json from `cwd` up to `top`, else the first one with frontends below `top`. */
export function findConfig(
  top: string,
  cwd: string
): { dir: string; config: Record<string, any> } | null {
  const read = (dir: string) => {
    try {
      return JSON.parse(readFileSync(join(dir, 'pikku.config.json'), 'utf8'))
    } catch {
      return null
    }
  }
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const config = read(dir)
    if (config) return { dir, config }
    if (dir === top || dir === dirname(dir) || !dir.startsWith(top)) break
  }
  const found: Array<{ dir: string; config: Record<string, any> }> = []
  const walk = (dir: string, depth: number) => {
    const config = read(dir)
    if (config) found.push({ dir, config })
    if (depth === 0) return
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {}
    for (const name of entries.sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const sub = join(dir, name)
      try {
        if (statSync(sub).isDirectory()) walk(sub, depth - 1)
      } catch {}
    }
  }
  walk(top, 3)
  return found.find((f) => f.config.frontends) ?? found[0] ?? null
}

/**
 * The files this change set touched, relative to the repo root. Nothing
 * records the branch a changeset was raised from (`claim --worktree` cuts
 * `changeset/<slug>` from wherever it ran), so the base is the nearest branch
 * point: of every other local branch, the merge-base with HEAD that has the
 * fewest commits after it, leaving out branches that already contain HEAD.
 * With no such branch, the files of the HEAD commit.
 */
export async function touchedFiles(
  git: Git
): Promise<{ base: string | null; files: string[] }> {
  const head = (await git(['rev-parse', 'HEAD'])).trim()
  const current = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const branches = (
    await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  )
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b && b !== current)
  let best: { branch: string; base: string; ahead: number } | null = null
  for (const branch of branches) {
    const base = (
      await git(['merge-base', 'HEAD', branch]).catch(() => '')
    ).trim()
    if (!base || base === head) continue
    const ahead = Number(
      (await git(['rev-list', '--count', `${base}..HEAD`])).trim()
    )
    if (!best || ahead < best.ahead) best = { branch, base, ahead }
  }
  const list = (out: string) =>
    out
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
  if (best)
    return {
      base: best.branch,
      files: list(await git(['diff', '--name-only', best.base, 'HEAD'])),
    }
  return {
    base: null,
    files: list(
      await git([
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--name-only',
        '-r',
        'HEAD',
      ])
    ),
  }
}

/**
 * Pages whose route file was touched. A touched route file that is not a page
 * (a layout, `__root`) touches every page under it: `__root` all of its
 * frontend, `_site.tsx` or `_site/route.tsx` every `_site.*` / `_site/*` page.
 */
export function touchedPages(
  pages: AppPage[],
  workspaceRoot: string,
  touched: string[]
): AppPage[] {
  const hit = new Set<AppPage>()
  const abs = new Set(touched)
  const byApp = new Map<string, AppPage[]>()
  for (const page of pages) {
    const list = byApp.get(page.app) ?? []
    list.push(page)
    byApp.set(page.app, list)
    if (abs.has(resolve(workspaceRoot, page.file))) hit.add(page)
  }
  for (const [app, appPages] of byApp) {
    const routesDir = resolve(workspaceRoot, app, 'src', 'routes')
    const pageFiles = new Set(
      appPages.map((p) => resolve(workspaceRoot, p.file))
    )
    for (const file of abs) {
      if (!file.startsWith(routesDir + sep) || pageFiles.has(file)) continue
      const rel = relative(routesDir, file).split(sep).join('/')
      if (/^__root\./.test(rel)) {
        appPages.forEach((p) => hit.add(p))
        continue
      }
      const stem = rel.replace(/\.[^./]+$/, '').replace(/\/route$/, '')
      for (const page of appPages) {
        const pageRel = relative(routesDir, resolve(workspaceRoot, page.file))
          .split(sep)
          .join('/')
        if (pageRel.startsWith(`${stem}/`) || pageRel.startsWith(`${stem}.`))
          hit.add(page)
      }
    }
  }
  return pages.filter((p) => hit.has(p))
}

const shortSha = (sha?: string | null) => (sha ? sha.slice(0, 7) : 'unknown')

export async function checkPageGate({
  git,
  cwd = process.cwd(),
  env = process.env,
  waive,
  label = 'This change',
  discover = (root) => discoverPages(root),
  pages: declaredPages = [],
}: PageGateInput): Promise<PageGateOutcome> {
  if (env.PIKKU_COMPARE_GATE === 'off') return { kind: 'off' }
  const reason = waive?.trim()
  if (waive !== undefined && (reason?.length ?? 0) < MIN_WAIVER_LENGTH)
    return {
      kind: 'refuse',
      message: `--waive needs a reason of at least ${MIN_WAIVER_LENGTH} characters: say why the phone page cannot match the original. A waiver covers only widths under ${WAIVABLE_BELOW} px.`,
    }

  const top = resolve((await git(['rev-parse', '--show-toplevel'])).trim())
  const sites = referenceSites(top)
  const clone = isCloneProject(top)
  if (!sites.length && !clone)
    return { kind: 'skip', why: `no reference under ${REFERENCES_DIR}` }

  const found = findConfig(top, cwd)
  const configDir = found?.dir ?? top
  const configured = Number(found?.config?.pagesCompare?.threshold)
  const threshold = Number.isFinite(configured) ? configured : DEFAULT_THRESHOLD
  const workspaceRoot = findWorkspaceRoot(configDir)

  const { base, files } = await touchedFiles(git)
  const pages = await discover(workspaceRoot)
  const asPath = (page: string) =>
    (page.startsWith('/') ? page : routeFor(page)).replace(/\/+$/, '') || '/'
  const declared = [...new Set(declaredPages.map(asPath))]
  // each declared page as its route's page (named by its own path); one with
  // no route yet stands in as itself, so its compare row says MISSING
  const touched = declared.length
    ? pages.length
      ? declared.map((path): AppPage => ({
          ...(pages.find((p) => routeExists(path, [p.path])) ?? {
            ...pages[0]!,
            file: '',
            params: [],
          }),
          path,
        }))
      : []
    : touchedPages(
        pages,
        workspaceRoot,
        files.map((f) => resolve(top, f))
      )
  if (!touched.length)
    return {
      kind: 'skip',
      why: `no page file touched${base ? ` since ${base}` : ' in HEAD'}`,
    }
  const problem = clone ? referenceProblem(top, sites) : null
  if (problem)
    return {
      kind: 'refuse',
      message: `${label} touched pages of a site rebuilt from an original (${touched.map((p) => p.path).join(', ')}), and it is done only when they are compared with a capture of the original.\n${problem}\nThen build the pages from that capture: its <page>.json, its style.json colours and fonts, and its pictures. Compare, commit, and run done again.`,
    }

  // where pages compare writes (artifacts/tmp/compare/<app>), and where it
  // wrote before (.pikku/pages/compare/<app>); the newest report wins
  const reportPaths = (app: string) => [
    ...new Set([
      join(defaultCompareDir(workspaceRoot, app), 'report.json'),
      join(defaultCompareDir(top, app), 'report.json'),
      join(
        configDir,
        '.pikku',
        'pages',
        'compare',
        basename(app),
        'report.json'
      ),
    ]),
  ]
  const latestReport = (
    app: string
  ): { path: string; report: Report } | null => {
    let best: { path: string; report: Report } | null = null
    for (const path of reportPaths(app)) {
      try {
        const report: Report = JSON.parse(readFileSync(path, 'utf8'))
        if (
          !best ||
          (report.generatedAt ?? '') > (best.report.generatedAt ?? '')
        )
          best = { path, report }
      } catch {}
    }
    return best
  }
  const reportPath = (app: string) =>
    latestReport(app)?.path ?? reportPaths(app)[0]!
  const readReport = (app: string): Report | null =>
    latestReport(app)?.report ?? null
  // the site the app's report was made against, else the first
  const siteFor = (app: string): Site => {
    const ref = readReport(app)?.reference
    return (ref && sites.find((s) => s.name === basename(ref))) || sites[0]!
  }

  type Need = { app: string; site: Site; shot: ReferenceShot; page: AppPage }
  const needs: Need[] = []
  touched.forEach((page, i) => {
    const site = siteFor(page.app)
    for (const shot of site.shots) {
      const route = routeFor(shot.id, site.map)
      if (
        declared.length
          ? asPath(route) === declared[i]
          : routeExists(route, [page.path])
      )
        needs.push({ app: page.app, site, shot, page })
    }
  })
  if (!needs.length)
    return {
      kind: 'skip',
      why: `the touched pages (${touched.map((p) => p.path).join(', ')}) have no reference screenshot`,
    }
  const pageList = [...new Set(needs.map((n) => n.page.path))]

  const head = (await git(['rev-parse', 'HEAD'])).trim()
  const rel = (p: string) => {
    const r = relative(cwd, p)
    return r && !r.startsWith('..') ? r : p
  }
  const apps = [...new Set(needs.map((n) => n.app))]
  const multipleApps = new Set(pages.map((p) => p.app)).size > 1
  const lines: string[] = []
  const commands: string[] = []
  let failing = false
  // a failure a waiver cannot cover: a desktop width, or a report that does not show the desktop widths at HEAD
  let desktopFailing = false
  const waived = new Set<string>()
  const isDesktop = (width: number) => width >= WAIVABLE_BELOW
  const fail = (width: number | null, what?: string) => {
    failing = true
    if (width === null || isDesktop(width)) desktopFailing = true
    else if (what) waived.add(what)
  }

  for (const app of apps) {
    const appNeeds = needs.filter((n) => n.app === app)
    const site = appNeeds[0]!.site
    const ids = [...new Set(appNeeds.map((n) => n.shot.id))]
    const report = readReport(app)
    const where = rel(reportPath(app))
    const reportDir = dirname(reportPath(app))
    commands.push(
      `pikku ui pages compare --reference ${rel(site.dir)}${multipleApps ? ` --app ${app}` : ''} --page ${ids.join(',')}`
    )
    const hasDesktop = appNeeds.some((n) => isDesktop(n.shot.width))
    if (!report) {
      fail(hasDesktop ? null : 0)
      for (const n of appNeeds) waived.add(`${n.page.path} @${n.shot.width}`)
      lines.push(`There is no compare report yet (${where}).`)
      lines.push(
        `Pages to compare: ${appNeeds.map((n) => `${n.shot.id} @${n.shot.width}`).join(', ')}.`
      )
      continue
    }
    const fresh = report.gitSha === head && report.dirty === false
    if (!fresh) {
      fail(hasDesktop ? null : 0)
      lines.push(
        report.gitSha === head
          ? `The compare report ${where} was taken at HEAD (${shortSha(head)}) but with uncommitted changes in ${app}, so it does not show what was committed. Commit, then compare again.`
          : `The compare report ${where} is stale: it was taken at ${shortSha(report.gitSha)}${report.generatedAt ? ` (${report.generatedAt})` : ''}, and HEAD is ${shortSha(head)}. Compare again after the last commit. Its old numbers:`
      )
    }
    const rows = report.rows ?? []
    const over: Array<{ need: Need; row: CompareRow }> = []
    const missing: Need[] = []
    const errors: Array<{ need: Need; row: CompareRow }> = []
    const absent: Need[] = []
    for (const need of appNeeds) {
      const row = rows.find(
        (r) => r.id === need.shot.id && r.width === need.shot.width
      )
      if (!row) absent.push(need)
      else if (row.status === 'missing') missing.push(need)
      else if (row.status === 'error') errors.push({ need, row })
      else if ((row.changedPercent ?? 100) > threshold) over.push({ need, row })
    }
    over.sort((a, b) => b.row.changedPercent! - a.row.changedPercent!)
    const at = (n: Need) => `${n.page.path} @${n.shot.width}`
    for (const n of [
      ...over.map((o) => o.need),
      ...missing,
      ...errors.map((e) => e.need),
      ...absent,
    ])
      fail(n.shot.width, at(n))
    if (over.length) {
      lines.push(`Over the ${threshold}% limit, worst first:`)
      for (const { need, row } of over) {
        lines.push(
          `  ${need.shot.id} @${row.width} (${row.path}): ${row.changedPercent}% of pixels differ, height ${row.ourHeight} px vs ${row.referenceHeight} px in the original. Diff: ${rel(join(reportDir, `${need.shot.id}-${row.width}.diff.png`))}`
        )
        // what to change, without opening the image
        for (const style of (row.styles ?? []).slice(0, 4))
          lines.push(`      style  ${style.text}`)
      }
    }
    for (const need of missing)
      lines.push(
        `  MISSING ${need.shot.id} @${need.shot.width}: the compare found no page at ${routeFor(need.shot.id, site.map)}.`
      )
    for (const { need, row } of errors)
      lines.push(
        `  ERROR ${need.shot.id} @${need.shot.width}: ${row.error ?? 'the page could not be photographed'}.`
      )
    if (absent.length)
      lines.push(
        `No report entry for: ${absent.map((n) => `${n.shot.id} @${n.shot.width}`).join(', ')}.`
      )
  }

  if (!failing) return { kind: 'pass', pages: pageList }
  if (reason && !desktopFailing)
    return { kind: 'waived', reason, pages: [...waived] }
  const message = [
    ...(reason
      ? [
          `--waive refused: a waiver covers only phone widths (under ${WAIVABLE_BELOW} px), and a page at ${WAIVABLE_BELOW} px or wider is not done. Fix the differences below (the style lines name what to change), commit, compare again.`,
        ]
      : []),
    `${label} touched pages that have a reference screenshot (${pageList.join(', ')}), so it is done only when they look like the original: every page at every width within ${threshold}% changed pixels, compared at HEAD.`,
    ...lines,
    `Run: ${commands.join('  and  ')}`,
    'Then open each diff image: the original on the left, red where pixels differ in the middle, ours on the right. Fix what differs, commit, compare again, then run done again.',
    'Fix the style lines first: they say what differs without opening an image. Then open the diff image of the worst page.',
    `Only a phone width (under ${WAIVABLE_BELOW} px) that cannot match can be finished with --waive "<why it cannot match, ${MIN_WAIVER_LENGTH}+ characters>"; desktop widths must be within the limit.`,
  ].join('\n')
  return { kind: 'refuse', message }
}

/** Throws the refusal; otherwise says what to add to the done note (the waiver), if anything. */
export async function refuseUntilPagesCompared(
  input: PageGateInput
): Promise<{ outcome: PageGateOutcome; note?: string }> {
  const outcome = await checkPageGate(input)
  if (outcome.kind === 'refuse')
    throw new CloudPreconditionError(outcome.message)
  if (outcome.kind === 'waived')
    return {
      outcome,
      note: `Page compare waived for ${outcome.pages.join(', ')}: ${outcome.reason}`,
    }
  return { outcome }
}
