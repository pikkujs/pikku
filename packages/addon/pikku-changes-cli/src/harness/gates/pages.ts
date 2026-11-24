import { readFile, realpath, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as CliPages from '@pikku/cli/addon-support/pages'
import { pikkuHarnessGate } from '@pikku/core/harness'
import type { AppPage, ReferenceShot } from '@pikku/cli/addon-support/pages'
import {
  buildsPages,
  declaredNewPages,
  declaredPages,
  MAX_CLONE_PAGES,
} from '../../lib/change-plan.js'
import {
  DEFAULT_THRESHOLD,
  embeddedScreenshots,
  readSites,
  referenceProblem,
  REFERENCES_DIR,
  SITE_NOTES,
  touchedPages,
} from '../../lib/page-reference.js'
import { HarnessInfraError, type Finding } from '../finding.js'
import { gitIn, type Git } from '../git.js'
import { redact } from '../redact.js'
import { trimOutput } from '../run-cli.js'
import { changedFiles } from './changed.js'
import { changesetRun, declaredChangeset } from './declared.js'
import {
  PAGE_RULE,
  PHONE_RULE,
  pageFindings,
  readCompareReport,
  type PageNeed,
} from './pages-parser.js'

/**
 * The page compare settings a person keeps on the target branch: `threshold` (changed-pixel percent,
 * DEFAULT_THRESHOLD without one) and `widths` (all the capture has without one). Read from the
 * base commit only. They are not in `pikku.config.json`, whose keys the CLI checks.
 */
export const COMPARE_SETTINGS = join('artifacts', 'pages-compare.json')

/** Where the gate's compare writes, inside the worktree: under `.pikku`, never `artifacts/compare`. */
export const COMPARE_OUT = join('.pikku', 'compare')
const DEFAULT_TIMEOUT_MS = 900_000
/** Where the compare's browser is: passed on from the harness's environment (runCli passes nothing else of it). */
const BROWSER_ENV = [
  'PIKKU_CHROMIUM',
  'PLAYWRIGHT_CHROMIUM_PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
]

type PageSupport = Pick<
  typeof CliPages,
  | 'discoverPages'
  | 'findWorkspaceRoot'
  | 'readReference'
  | 'routeExists'
  | 'routeFor'
>

/**
 * The page support of the pinned CLI that runs the compare (its `dist/src/addon-support-pages.js`, beside
 * the `dist/bin` it runs from), so routes and captures are read as that compare reads them; else the
 * one installed with the addon. Loaded only when a changeset has pages to compare.
 */
const loadPageSupport = async (binary: string): Promise<PageSupport> => {
  let beside: string | undefined
  try {
    const path = join(
      dirname(await realpath(binary)),
      '..',
      'src',
      'addon-support-pages.js'
    )
    if ((await stat(path)).isFile()) beside = path
  } catch {
    // not a CLI checkout or package
  }
  let support: Partial<PageSupport>
  try {
    support = beside
      ? await import(pathToFileURL(beside).href)
      : await import('@pikku/cli/addon-support/pages')
  } catch (error) {
    throw new HarnessInfraError(
      'missing-binary',
      redact(
        `The page gate cannot read the pages: neither the pinned pikku CLI nor the installed @pikku/cli has page support (addon-support/pages): ${error instanceof Error ? error.message : String(error)}`
      )
    )
  }
  for (const name of [
    'discoverPages',
    'findWorkspaceRoot',
    'readReference',
    'routeExists',
    'routeFor',
  ] as const)
    if (typeof support[name] !== 'function')
      throw new HarnessInfraError(
        'missing-binary',
        `The page gate cannot read the pages: the CLI's page support has no ${name}.`
      )
  return support as PageSupport
}

const high = (message: string, file?: string): Finding => ({
  ...(file ? { file } : {}),
  severity: 'high',
  rule: PAGE_RULE,
  message,
})

/** A clone at the base commit: a folder under `artifacts/references/`, or the archaeology notes. */
const cloneAt = async (git: Git, base: string): Promise<boolean> => {
  const folders = await git([
    'ls-tree',
    '-d',
    '--name-only',
    `${base}:${REFERENCES_DIR}`,
  ]).catch(() => '')
  if (folders.trim()) return true
  return git(['cat-file', '-e', `${base}:${SITE_NOTES}`]).then(
    () => true,
    () => false
  )
}

/** Paths under the reference the changeset changed against the base, committed or not. */
const referenceChanges = async (git: Git, base: string): Promise<string[]> => {
  const committed = await git([
    'diff',
    '--name-only',
    `${base}...HEAD`,
    '--',
    REFERENCES_DIR,
  ])
  const local = await git([
    'status',
    '--porcelain',
    '-uall',
    '--',
    REFERENCES_DIR,
  ])
  return [
    ...new Set([
      ...committed.split('\n').filter(Boolean),
      ...local
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3)),
    ]),
  ].sort()
}

/**
 * The project's `pikku.config.json` as the base commit has it, found as the CLI's done gate finds it
 * in a checkout: the root one, else the first (up to three folders down) that declares frontends,
 * else the first. Its folder is where the frontend's workspace is looked for.
 */
export const baseConfig = async (
  git: Git,
  base: string
): Promise<{ path: string; config: Record<string, any> } | null> => {
  const paths = (await git(['ls-tree', '-r', '--name-only', base]))
    .split('\n')
    .filter((path) => {
      const segments = path.split('/')
      return (
        segments.at(-1) === 'pikku.config.json' &&
        segments.length <= 4 &&
        !segments.some((s) => s.startsWith('.') || s === 'node_modules')
      )
    })
    .sort(
      (a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1)
    )
  const read = async (path: string) => {
    try {
      const config = JSON.parse(await git(['show', `${base}:${path}`]))
      return config && typeof config === 'object' ? config : {}
    } catch {
      return {}
    }
  }
  const found: { path: string; config: Record<string, any> }[] = []
  for (const path of paths) {
    const config = await read(path)
    if (!path.includes('/')) return { path, config }
    found.push({ path, config })
  }
  return found.find((f) => f.config.frontends) ?? found[0] ?? null
}

/** The base commit's COMPARE_SETTINGS; none is `{}`, one that does not read stops the run for a person. */
const baseSettings = async (
  git: Git,
  base: string
): Promise<Record<string, unknown>> => {
  let text: string
  try {
    text = await git(['show', `${base}:${COMPARE_SETTINGS}`])
  } catch {
    return {}
  }
  try {
    const settings = JSON.parse(text)
    if (settings && typeof settings === 'object' && !Array.isArray(settings))
      return settings
  } catch {
    // reported below
  }
  throw new HarnessInfraError(
    'precondition',
    `${COMPARE_SETTINGS} on ${base.slice(0, 12)} is not a JSON object; a person has to fix it.`
  )
}

const numbers = (value: unknown): number[] | undefined =>
  Array.isArray(value) &&
  value.length &&
  value.every((n) => typeof n === 'number' && n > 0)
    ? (value as number[])
    : undefined

type Target = { app: string; path: string; shots: ReferenceShot[] }

/**
 * A changeset that builds pages of a site rebuilt from a captured original is judged by
 * `pikku ui pages compare` against that capture, as `pikku changes done` judges a change: each
 * declared page (its `Pages:` line, else the pages a frontend change touched) at each width within
 * the threshold of the original's screenshot. The threshold and the widths come from the base
 * commit's `artifacts/pages-compare.json`, so nothing the builder commits can loosen them, and the
 * builder cannot change the reference. Only a person can let a phone width through, by waiving its
 * finding when the engine asks. The compare runs with the run's pinned pikku CLI, writes under
 * `.pikku/compare/` in the worktree and, with PIKKU_CHANGES_PARALLEL, starts this worktree's own
 * servers on free ports. A changeset with no pages passes without running anything.
 */
export const pagesGate = pikkuHarnessGate({
  name: 'pages',
  description:
    'The pages a changeset builds of a site rebuilt from an original match the original',
  failOn: 'high',
  writes: ['.pikku/compare/**'],
  waivable: [PHONE_RULE],
  workflowTimeout: '16min',
  func: async (_services, _data, { gate }) => {
    const worktree = gate.worktree
    const git = gitIn(worktree)
    const { changeset, items, storePath } = changesetRun(gate)
    const declared = await declaredChangeset(worktree, changeset, storePath)
    const building = new Set(items.map((item) => item.changeId))
    const changes = declared.changes.filter((c) => building.has(c.changeId))
    if (changes.length !== building.size)
      throw new HarnessInfraError(
        'precondition',
        `The page gate cannot read what the changeset's changes declare: ${items.length - changes.length} of its ${items.length} change(s) are not on the changes queue under changeset ${changeset}.`
      )
    const label =
      changes.map((c) => `#${c.shortId}`).join(', ') || 'This changeset'
    const frontend = changes.some((c) => buildsPages(c))
    if (
      !frontend &&
      !changes.some(
        (c) => declaredPages(c.body).length || declaredNewPages(c.body).length
      )
    )
      return []
    if (!(await cloneAt(git, gate.base))) return []

    const changed = await referenceChanges(git, gate.base)
    if (changed.length)
      return [
        high(
          `${label} changes the capture of the original (${changed.slice(0, 10).join(', ')}${changed.length > 10 ? ', …' : ''}). The capture is what the pages are judged against, as it is on ${gate.base.slice(0, 12)}: restore it (\`git checkout ${gate.base.slice(0, 12)} -- ${REFERENCES_DIR}\` and remove anything added there), commit, then stop. If a page is missing from the capture, ask with \`pikku changes ask\`.`
        ),
      ]

    const binary = gate.tool('pikku')
    const {
      discoverPages,
      findWorkspaceRoot,
      readReference,
      routeExists,
      routeFor,
    } = await loadPageSupport(binary)
    /** A page as a route path: `/about/` and the reference id `about` are `/about`, `index` is `/`. */
    const asPagePath = (page: string) => {
      const trimmed = page.trim()
      return (
        (trimmed.startsWith('/') ? trimmed : routeFor(trimmed)).replace(
          /\/+$/,
          ''
        ) || '/'
      )
    }
    const newPages = [
      ...new Set(
        changes.flatMap((c) => declaredNewPages(c.body)).map(asPagePath)
      ),
    ]
    const named = [
      ...new Set(changes.flatMap((c) => declaredPages(c.body)).map(asPagePath)),
    ].filter((path) => !newPages.includes(path))

    const findings: Finding[] = []
    for (const change of changes) {
      const pages = declaredPages(change.body)
      if (pages.length > MAX_CLONE_PAGES)
        findings.push(
          high(
            `#${change.shortId} names ${pages.length} pages (${pages.join(', ')}); a change of a site rebuilt from an original builds at most ${MAX_CLONE_PAGES}, each compared with the original. Ask with \`pikku changes ask\` to have it split.`
          )
        )
    }
    if (findings.length) return findings

    const sites = readSites(worktree, readReference)
    const problem = referenceProblem(worktree, sites)
    if (problem)
      throw new HarnessInfraError(
        'precondition',
        redact(
          `${label} builds pages of a site rebuilt from an original, and the capture on ${gate.base.slice(0, 12)} cannot judge them; a person has to capture it.\n${problem}`
        )
      )
    // Whatever the compare says, a page that is the original's screenshot is not a page.
    const cheats = embeddedScreenshots(worktree, sites)
    if (cheats.length)
      return [
        high(
          [
            `${label} shows the original's screenshots as its pages:`,
            ...cheats.slice(0, 10).map((line) => `  ${line}`),
            ...(cheats.length > 10
              ? [`  … and ${cheats.length - 10} more`]
              : []),
            "The screenshots are the answer key, not material. Build each page from the original's text (as i18n messages), its pictures (artifacts/references/<site>/pictures/), its colours, fonts and layout (the .style.json and .layout.json files). Delete these files, build the page, commit, then stop; the compare runs after you stop.",
          ].join('\n')
        ),
      ]

    const config = await baseConfig(git, gate.base)
    const settings = await baseSettings(git, gate.base)
    const configured = Number(settings?.threshold)
    const threshold = Number.isFinite(configured)
      ? configured
      : DEFAULT_THRESHOLD
    const widths = numbers(settings?.widths)

    const configDir = config ? join(worktree, dirname(config.path)) : worktree
    const workspaceRoot = findWorkspaceRoot(configDir)
    const appPages: AppPage[] = await discoverPages(workspaceRoot)
    const routes = appPages.map((page) => page.path)
    for (const path of newPages)
      if (!routeExists(path, routes))
        findings.push(
          high(
            `${label} declares ${path} as a new page (no original to compare with), and the frontend has no route for it. Build the page, commit, then stop; the checks run after you stop.`
          )
        )

    const site = sites[0]!
    const routeOf = (shot: ReferenceShot) => routeFor(shot.id, site.map)
    const targets: Target[] = []
    if (named.length) {
      if (!appPages.length)
        return [
          ...findings,
          high(
            `${label} names pages (${named.join(', ')}), and no frontend page was found under ${workspaceRoot === worktree ? 'this worktree' : workspaceRoot} to compare them on. Build them in the project's frontend, commit, then stop.`
          ),
        ]
      const unmatched: string[] = []
      for (const path of named) {
        const shots = site.shots.filter(
          (shot) => asPagePath(routeOf(shot)) === path
        )
        if (!shots.length) unmatched.push(path)
        const app = (
          appPages.find((page) => routeExists(path, [page.path])) ??
          appPages[0]!
        ).app
        targets.push({ app, path, shots })
      }
      if (unmatched.length) {
        const captured = [
          ...new Set(site.shots.map((shot) => asPagePath(routeOf(shot)))),
        ].sort()
        findings.push(
          high(
            `${label} names pages that have no screenshot in the capture of the original: ${unmatched.join(', ')}. Each page a change of a clone names is compared with the original, so it has to be a page of the original. The capture has: ${captured.join(', ')}. If the change names the wrong path, or a page is missing from the capture, ask with \`pikku changes ask\`.`
          )
        )
      }
    } else {
      const touched = touchedPages(
        appPages,
        workspaceRoot,
        (await changedFiles(worktree, gate.base)).map((file) =>
          resolve(worktree, file)
        )
      ).filter(
        (page) => !newPages.some((path) => routeExists(path, [page.path]))
      )
      if (!touched.length) {
        if (newPages.length) return findings
        return [
          ...findings,
          high(
            `${label} is a frontend change of a site rebuilt from an original, it names no pages (no \`Pages:\` line in its body) and it touched no page or route file since ${gate.base.slice(0, 12)}, so nothing holds it to the original. If it builds pages, commit their route files, then stop (the pages it touched are compared with the original); if it builds none, ask with \`pikku changes ask\`.`
          ),
        ]
      }
      if (touched.length > MAX_CLONE_PAGES)
        return [
          ...findings,
          high(
            `${label} names no pages and touched ${touched.length} of them (${touched.map((p) => p.path).join(', ')}); a change of a site rebuilt from an original is compared on at most ${MAX_CLONE_PAGES} pages. Ask with \`pikku changes ask\` to have it split, each part naming its pages.`
          ),
        ]
      for (const page of touched) {
        const shots = site.shots.filter((shot) =>
          routeExists(routeOf(shot), [page.path])
        )
        for (const path of new Set(
          shots.map((shot) => asPagePath(routeOf(shot)))
        ))
          targets.push({
            app: page.app,
            path,
            shots: shots.filter((shot) => asPagePath(routeOf(shot)) === path),
          })
      }
    }

    const needs = new Map<string, PageNeed[]>()
    for (const target of targets) {
      if (!target.shots.length) continue
      const kept = target.shots.filter(
        (shot) => !widths || widths.includes(shot.width)
      )
      if (!kept.length)
        throw new HarnessInfraError(
          'precondition',
          `widths (${widths!.join(', ')}) in ${COMPARE_SETTINGS} on ${gate.base.slice(0, 12)} names no width the capture of ${target.path} has (${target.shots.map((s) => s.width).join(', ')}); a person has to fix the config.`
        )
      const list = needs.get(target.app) ?? []
      for (const shot of kept)
        if (!list.some((n) => n.id === shot.id && n.width === shot.width))
          list.push({ id: shot.id, width: shot.width, path: target.path })
      needs.set(target.app, list)
    }
    if (!needs.size) return findings

    const head = (await git(['rev-parse', 'HEAD'])).trim()
    for (const [app, list] of needs) {
      const dir = join(COMPARE_OUT, basename(app))
      const out = join(worktree, dir)
      // only what this run writes is read
      await rm(out, { recursive: true, force: true })
      const started = new Date().toISOString()
      await gate.runCli(
        [
          'ui',
          'pages',
          'compare',
          '--reference',
          site.dir,
          '--app',
          app,
          '--page',
          [...new Set(list.map((n) => n.id))].join(','),
          ...(widths ? ['--widths', widths.join(',')] : []),
          '--out',
          out,
        ],
        {
          binary,
          parse: () => [],
          okCodes: [0],
          timeoutMs: DEFAULT_TIMEOUT_MS,
          env: {
            ...Object.fromEntries(
              BROWSER_ENV.flatMap((name) =>
                process.env[name] ? [[name, process.env[name]!]] : []
              )
            ),
            PIKKU_CHANGES_PARALLEL: '1',
            PIKKU_CLI_BIN: binary,
          },
        }
      )
      let text: string
      try {
        text = await readFile(join(out, 'report.json'), 'utf8')
      } catch {
        throw new HarnessInfraError(
          'unparseable',
          `pikku ui pages compare for ${app} wrote no report at ${join(dir, 'report.json')}`
        )
      }
      try {
        const report = readCompareReport(text)
        if (report.generatedAt < started)
          throw new Error(
            `the report was written at ${report.generatedAt}, before this compare started (${started})`
          )
        if (report.gitSha !== head)
          throw new Error(
            `the report was taken at ${report.gitSha ?? 'no commit'}, not at HEAD ${head}`
          )
        findings.push(
          ...pageFindings({
            report,
            needs: list,
            threshold,
            diffDir: dir,
          })
        )
      } catch (error) {
        throw new HarnessInfraError(
          'unparseable',
          redact(
            `pikku ui pages compare for ${app}: ${join(dir, 'report.json')} cannot be read as a compare of ${list.map((n) => `${n.path} @${n.width}`).join(', ')}: ${trimOutput(error instanceof Error ? error.message : String(error), 600)}`
          )
        )
      }
    }
    return findings
  },
})
