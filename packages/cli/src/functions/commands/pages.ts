import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import type { z } from 'zod'
import type * as PlaywrightModule from '@pikku/playwright'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  discoverPages,
  navigablePaths,
  type AppPage,
} from '@pikku/code-edit/routes'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'
import { added, changed, dim } from '../../utils/output.js'
import {
  PagesListInput,
  PagesListOutput,
  PagesScreenshotInput,
  PagesScreenshotOutput,
  PagesCompareInput,
  PagesCompareOutput,
} from './pages.schemas.js'
import {
  compareShot,
  loadSiteCapture,
  overThreshold,
  readReference,
  routeExists,
  routeFor,
  worstFirst,
  type CompareRow,
} from './pages-compare.js'
import {
  DEFAULT_BROWSER_DRIVER,
  resolveScenarioBrowserProvider,
} from './scenario-browser.js'
import { primaryFrontendName, resolveEnvironment } from './environment.js'
import { resolveVirtualUsers } from '../../utils/resolve-virtual-users.js'
import {
  resolveStatementMint,
  runtimeDirOf,
} from '../../utils/virtual-user-signer.js'

type PlaywrightDriver = typeof PlaywrightModule
import type { SingletonServices } from '../../../types/application-types.js'

const parseParams = (raw?: string): Record<string, string> =>
  Object.fromEntries(
    (raw ?? '')
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf('=')
        if (at < 1)
          throw new Error(`--params takes name=value pairs, got '${pair}'`)
        return [pair.slice(0, at), pair.slice(at + 1)]
      })
  )

const oneApp = (pages: AppPage[], app?: string): string => {
  const apps = [...new Set(pages.map((page) => page.app))]
  if (app) return app
  if (apps.length === 1) return apps[0]!
  throw new Error(
    apps.length
      ? `Several frontends have routes (${apps.join(', ')}); pass --app, since one base url serves one of them`
      : 'No frontend has a src/routes directory with TanStack file routes'
  )
}

const loadDriver = async (): Promise<PlaywrightDriver> => {
  const driverName = DEFAULT_BROWSER_DRIVER
  return (await import(driverName).catch(() => {
    throw new Error(
      `Screenshots need '${driverName}'. Run 'yarn add -D ${driverName} @playwright/test'.`
    )
  })) as PlaywrightDriver
}

/** A browser page on the app: signed out, or signed in as a virtual user with `as`. */
const openSession = async (
  {
    config,
    getInspectorState,
    variables,
  }: Pick<SingletonServices, 'config' | 'getInspectorState' | 'variables'>,
  {
    baseUrl,
    as,
    environment = 'local',
    backend,
  }: { baseUrl: string; as?: string; environment?: string; backend?: string }
): Promise<{
  session: InstanceType<PlaywrightDriver['VirtualUserSession']>
  close: () => Promise<void>
}> => {
  const driver = await loadDriver()
  if (!as) return driver.openPageSession(baseUrl)
  const state = await getInspectorState(true, false, false, true)
  const env = resolveEnvironment({
    environment,
    environments: config.environments ?? {},
    backend,
    primaryFrontend: primaryFrontendName(config.frontends),
    appUrl: baseUrl,
  })
  const provider = await resolveScenarioBrowserProvider({
    environment,
    apiUrl: env.apiUrl,
    appUrl: baseUrl,
    mint: await resolveStatementMint(variables, {
      apiUrl: env.apiUrl,
      runtimeDir: runtimeDirOf(config),
      what: 'page screenshots',
    }),
    virtualUsers: resolveVirtualUsers(
      state.virtualUsers?.definitions ?? [],
      config.scenarios?.emailDomain
    ),
    signInPath: env.signInPath,
    browserScenarios: ['pages screenshot'],
    driver: config.scenarios?.browserDriver,
  })
  const session = (await provider.sessionFor(as)) as InstanceType<
    PlaywrightDriver['VirtualUserSession']
  >
  return { session, close: () => provider.close() }
}

export const pagesList = pikkuSessionlessFunc({
  description:
    "List every frontend's pages from its TanStack Router route files: the app, the route path, the file and its params.",
  input: PagesListInput,
  output: PagesListOutput,
  func: async ({ config }, { app }) => ({
    pages: await discoverPages(
      findWorkspaceRoot(config.rootDir),
      app ? { apps: [app] } : {}
    ),
  }),
})

export const renderPagesList = (
  _services: unknown,
  { pages }: z.infer<typeof PagesListOutput>
): void => {
  if (!pages.length) {
    process.stdout.write(
      'No frontend has TanStack file routes under src/routes.\n'
    )
    return
  }
  let app: string | undefined
  for (const page of pages) {
    if (page.app !== app) {
      app = page.app
      process.stdout.write(`${app}\n`)
    }
    process.stdout.write(`  ${page.path} ${dim(page.file)}\n`)
  }
}

export const pagesScreenshot = pikkuSessionlessFunc({
  description:
    'Photograph every page of one frontend on a running server. Pages whose params have no value are skipped; pass --params to fill them, and --as to sign in as a virtual user first.',
  input: PagesScreenshotInput,
  output: PagesScreenshotOutput,
  func: async (
    { config, getInspectorState, variables },
    { baseUrl, app, out, params, as, environment = 'local', backend, viewport }
  ) => {
    const root = findWorkspaceRoot(config.rootDir)
    const all = await discoverPages(root, app ? { apps: [app] } : {})
    const target = oneApp(all, app)
    const { paths, skipped } = navigablePaths(
      all.filter((page) => page.app === target),
      parseParams(params)
    )
    const driver = await loadDriver()
    const { session, close } = await openSession(
      { config, getInspectorState, variables },
      { baseUrl, as, environment, backend }
    )

    const dir = resolve(
      out ??
        join(
          config.rootDir,
          config.outDir,
          'pages',
          'screenshots',
          basename(target)
        )
    )
    mkdirSync(dir, { recursive: true })
    try {
      const shots = await driver.screenshotPages({
        session,
        paths,
        fullPage: !viewport,
      })
      return {
        app: target,
        baseUrl,
        dir: relative(process.cwd(), dir) || '.',
        shots: shots.map(({ path, png, httpStatus, error, issues }) => {
          let file: string | null = null
          if (png) {
            file = join(dir, driver.screenshotName(path))
            writeFileSync(file, png)
            file = relative(process.cwd(), file)
          }
          return {
            path,
            file,
            httpStatus,
            ...(error ? { error } : {}),
            problems: [
              ...issues.apiErrors.map((e) => `API ${e}`),
              ...issues.pageErrors.map((e) => `threw: ${e}`),
              ...issues.consoleErrors.map((e) => `console: ${e}`),
            ],
          }
        }),
        skipped: skipped.map(({ path, params }) => ({ path, params })),
      }
    } finally {
      await close()
    }
  },
})

export const renderPagesScreenshot = (
  _services: unknown,
  { app, baseUrl, dir, shots, skipped }: z.infer<typeof PagesScreenshotOutput>
): void => {
  const taken = shots.filter((shot) => shot.file).length
  process.stdout.write(
    `${app} at ${baseUrl}: ${taken}/${shots.length} pages to ${dir}\n`
  )
  for (const shot of shots) {
    const status =
      shot.httpStatus && shot.httpStatus >= 400
        ? changed(` HTTP ${shot.httpStatus}`)
        : ''
    process.stdout.write(
      shot.file
        ? `  ${added('✓')} ${shot.path}${status} ${dim(shot.file)}\n`
        : `  ${changed('✗')} ${shot.path} ${dim(shot.error ?? 'no image')}\n`
    )
    for (const problem of shot.problems)
      process.stdout.write(
        `      ${dim(problem.split('\n')[0]!.slice(0, 160))}\n`
      )
  }
  if (skipped.length) {
    process.stdout.write(
      `${dim(`Skipped ${skipped.length} needing a param value (--params name=value):`)}\n`
    )
    for (const page of skipped)
      process.stdout.write(`  ${page.path} ${dim(page.params.join(', '))}\n`)
  }
}

export const pagesCompare = pikkuSessionlessFunc({
  description:
    "Compare one frontend's pages with reference screenshots (<id>-<width>.jpg|png, as the pikku-site-clone capture writes them): photograph each page at each width, write <id>-<width>.diff.png and report.json, and report the changed-pixel share, the page heights and, where the reference has a layout.json, the biggest section differences. A reference page with no route is MISSING.",
  input: PagesCompareInput,
  output: PagesCompareOutput,
  func: async (
    { config, getInspectorState, variables },
    {
      reference,
      baseUrl,
      app,
      out,
      widths,
      page,
      map,
      threshold,
      params,
      as,
      environment = 'local',
      backend,
    }
  ) => {
    const refDir = resolve(reference)
    let shots = readReference(refDir)
    const onlyIds = page
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (onlyIds?.length)
      shots = shots.filter((shot) => onlyIds.includes(shot.id))
    const wanted = widths
      ? widths
          .split(',')
          .map((w) => Number(w.trim()))
          .filter(Boolean)
      : [...new Set(shots.map((shot) => shot.width))]
    shots = shots.filter((shot) => wanted.includes(shot.width))
    if (!shots.length)
      throw new Error(
        `No reference screenshot in ${reference} for ${onlyIds?.length ? `page ${onlyIds.join(', ')} at ` : ''}width ${wanted.join(', ')}`
      )

    const mapFile = map ?? join(refDir, 'map.json')
    const routeMap: Record<string, string> = existsSync(mapFile)
      ? JSON.parse(readFileSync(mapFile, 'utf8'))
      : map
        ? (() => {
            throw new Error(`--map ${map} does not exist`)
          })()
        : {}

    const root = findWorkspaceRoot(config.rootDir)
    const all = await discoverPages(root, app ? { apps: [app] } : {})
    const target = oneApp(all, app)
    const routes = all.filter((p) => p.app === target).map((p) => p.path)
    const builtinParams = parseParams(params)
    const fill = (path: string) =>
      path.replace(/\$(\w+)/g, (whole, name) => builtinParams[name] ?? whole)

    const dir = resolve(
      out ??
        join(
          config.rootDir,
          config.outDir,
          'pages',
          'compare',
          basename(target)
        )
    )
    mkdirSync(dir, { recursive: true })
    // relative when under the working directory, absolute otherwise
    const rel = (file: string) => {
      const r = relative(process.cwd(), file) || '.'
      return r.startsWith('..') ? file : r
    }

    const siteCapture = await loadSiteCapture()
    const withLayout = shots.some((shot) => shot.layout)
    const sectionsNote = !withLayout
      ? 'The reference has no <id>-<width>.layout.json, so there are no section differences.'
      : siteCapture
        ? null
        : 'Section differences left out: the pikku-site-clone capture script (in @pikku/skills) could not be loaded to read our layout.'

    const rows: CompareRow[] = []
    const blank = {
      changedPercent: null,
      referenceHeight: null,
      ourHeight: null,
      heightDiff: null,
      httpStatus: null,
      diff: null,
      ours: null,
      sections: null,
    }
    const present = shots.filter((shot) => {
      const path = fill(routeFor(shot.id, routeMap))
      if (routeExists(path, routes)) return true
      rows.push({
        id: shot.id,
        width: shot.width,
        path,
        status: 'missing',
        ...blank,
      })
      return false
    })

    if (present.length) {
      const driver = await loadDriver()
      const { session, close } = await openSession(
        { config, getInspectorState, variables },
        { baseUrl, as, environment, backend }
      )
      try {
        for (const width of [...new Set(present.map((shot) => shot.width))]) {
          const atWidth = present.filter((shot) => shot.width === width)
          const paths = atWidth.map((shot) => fill(routeFor(shot.id, routeMap)))
          const taken = await driver.screenshotPages({
            session,
            paths,
            width,
            fullPage: true,
            inspect: async (pwPage) => {
              if (!siteCapture) return null
              await siteCapture.settle(pwPage).catch(() => {})
              return withLayout
                ? await pwPage
                    .evaluate(siteCapture.extractInPage)
                    .catch(() => null)
                : null
            },
          })
          atWidth.forEach((shot, i) => {
            const got = taken[i]!
            const base = {
              id: shot.id,
              width,
              path: got.path,
              ...blank,
              httpStatus: got.httpStatus,
            }
            if (got.httpStatus === 404) {
              rows.push({ ...base, status: 'missing' })
              return
            }
            if (!got.png) {
              rows.push({
                ...base,
                status: 'error',
                error: got.error ?? 'no screenshot',
              })
              return
            }
            try {
              const oursFile = join(dir, `${shot.id}-${width}.png`)
              writeFileSync(oursFile, got.png)
              const { diff, referenceHeight, ourHeight } = compareShot(
                shot,
                got.png
              )
              const diffFile = join(dir, `${shot.id}-${width}.diff.png`)
              writeFileSync(diffFile, diff.png)
              let sections: CompareRow['sections'] = null
              if (siteCapture && shot.layout && got.inspected) {
                const mine = { viewport: width, ...(got.inspected as object) }
                writeFileSync(
                  join(dir, `${shot.id}-${width}.layout.json`),
                  JSON.stringify(mine)
                )
                sections = siteCapture.sectionDiff(
                  JSON.parse(readFileSync(shot.layout, 'utf8')),
                  mine
                )
              }
              rows.push({
                ...base,
                status: 'compared',
                changedPercent: diff.changedPercent,
                referenceHeight,
                ourHeight,
                heightDiff: ourHeight - referenceHeight,
                diff: rel(diffFile),
                ours: rel(oursFile),
                sections,
              })
            } catch (err) {
              rows.push({
                ...base,
                status: 'error',
                error: err instanceof Error ? err.message : String(err),
              })
            }
          })
        }
      } finally {
        await close()
      }
    }

    const sorted = worstFirst(rows)
    const failed = overThreshold(sorted, threshold).map(
      (row) => `${row.id}@${row.width}`
    )
    const result = {
      app: target,
      baseUrl,
      reference: rel(refDir),
      dir: rel(dir),
      report: rel(join(dir, 'report.json')),
      widths: [...new Set(shots.map((shot) => shot.width))],
      threshold: threshold ?? null,
      sectionsNote,
      rows: sorted,
      failed,
    }
    writeFileSync(join(dir, 'report.json'), JSON.stringify(result, null, 1))
    if (failed.length) process.exitCode = 1
    return result
  },
})

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

export const renderPagesCompare = (
  _services: unknown,
  {
    app,
    baseUrl,
    reference,
    report,
    rows,
    threshold,
    failed,
    sectionsNote,
  }: z.infer<typeof PagesCompareOutput>
): void => {
  const compared = rows.filter((row) => row.status === 'compared')
  const missing = rows.filter((row) => row.status === 'missing')
  process.stdout.write(
    `${app} at ${baseUrl} against ${reference}: ${compared.length} compared, ${missing.length} missing, ${rows.length - compared.length - missing.length} failed\n`
  )
  for (const row of rows) {
    const label = `${row.id} @${row.width}`
    if (row.status === 'missing') {
      process.stdout.write(
        `  ${changed('MISSING')} ${label} ${dim(`no page at ${row.path}${row.httpStatus ? ` (HTTP ${row.httpStatus})` : ''}`)}\n`
      )
      continue
    }
    if (row.status === 'error') {
      process.stdout.write(
        `  ${changed('ERROR')}   ${label} ${dim(row.error ?? '')}\n`
      )
      continue
    }
    const pct = `${row.changedPercent!.toFixed(1)}%`.padStart(6)
    const over = threshold !== null && row.changedPercent! > threshold
    process.stdout.write(
      `  ${over ? changed(pct) : pct} ${label}  height ${row.ourHeight} vs ${row.referenceHeight} (${signed(row.heightDiff!)})${row.sections ? `  sections match ${row.sections.match}` : ''}\n`
    )
    for (const note of row.sections?.notes.slice(0, 2) ?? [])
      process.stdout.write(`        ${dim(note)}\n`)
  }
  if (sectionsNote) process.stdout.write(`${dim(sectionsNote)}\n`)
  process.stdout.write(`Report: ${report}\n`)
  if (threshold !== null)
    process.stdout.write(
      failed.length
        ? `${changed(`${failed.length} over ${threshold}%`)}: ${failed.join(', ')}\n`
        : `${added('✓')} every page within ${threshold}%\n`
    )
  const worst = compared[0]
  if (worst)
    process.stdout.write(
      `Worst${missing.length ? ' compared' : ''}: ${worst.id} @${worst.width}, ${worst.changedPercent}% changed: ${worst.diff}\n`
    )
}
