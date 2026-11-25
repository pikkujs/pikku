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
import { git } from '../../utils/git.js'
import { added, changed, dim } from '../../utils/output.js'
import {
  PagesListInput,
  PagesListOutput,
  PagesScreenshotInput,
  PagesScreenshotOutput,
  PagesCompareInput,
  PagesCompareOutput,
  PagesCaptureInput,
  PagesCaptureOutput,
} from './pages.schemas.js'
import {
  compareShot,
  defaultCompareDir,
  gitStamp,
  loadSiteCapture,
  overThreshold,
  readReference,
  routeExists,
  routeFor,
  styleDiff,
  worstFirst,
  type StyleSummary,
  type CompareRow,
} from './pages-compare.js'
import {
  DEFAULT_BROWSER_DRIVER,
  resolveScenarioBrowserProvider,
} from './scenario-browser.js'
import { primaryFrontendName, resolveEnvironment } from './environment.js'
import {
  devFrontendFor,
  serveFrontend,
  type OwnBackend,
  type Served,
} from './pages-serve.js'
import { frontendEnv, readEnvFile } from './dev-env.js'
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
        resolve(
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

/**
 * The compare starts its own servers on free ports only for a builder of a
 * parallel loop (PIKKU_CHANGES_PARALLEL=1) working in a linked worktree;
 * otherwise it uses what answers on the configured ports, as before.
 */
export const isolatedCompare = async (
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> =>
  env.PIKKU_CHANGES_PARALLEL === '1' && (await inLinkedWorktree(cwd))

/**
 * How this tree's backend is started for an isolated compare: `pikku dev
 * --serveOnly` (no codegen, so nothing in the tree is rewritten; it serves the
 * generated code the tree already has), from the config's directory, after
 * `pikku db migrate` there (a worktree's dev database starts empty); with
 * more than one backend, the first declared, which the frontends proxy to.
 * Null when the config declares no backend.
 */
export const ownBackend = (
  config: {
    configDir?: string
    rootDir: string
    backends?: Record<string, unknown>
  },
  bin: string | undefined = process.env.PIKKU_CLI_BIN || process.argv[1]
): OwnBackend | null => {
  const names = Object.keys(config.backends ?? {})
  if (!names.length || !bin) return null
  return {
    cwd: config.configDir ?? config.rootDir,
    command: [
      process.execPath,
      bin,
      'dev',
      ...(names.length > 1 ? ['--backend', names[0]!] : []),
      '--serveOnly',
      '--no-watch',
      '--no-frontends',
      '--no-hmr',
    ],
    migrate: [process.execPath, bin, 'db', 'migrate'],
  }
}

/** A linked worktree (`git worktree add`), not the main checkout. */
const inLinkedWorktree = async (cwd: string): Promise<boolean> => {
  try {
    const [dir, common] = (
      await git(
        [
          'rev-parse',
          '--path-format=absolute',
          '--git-dir',
          '--git-common-dir',
        ],
        cwd
      )
    )
      .trim()
      .split('\n')
    return !!dir && !!common && resolve(dir) !== resolve(common)
  } catch {
    return false
  }
}

/** Playwright's chromium, from whichever playwright package resolves. */
const loadChromium = async (): Promise<unknown> => {
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    const mod = await import(name).catch(() => null)
    const chromium = mod?.chromium ?? mod?.default?.chromium
    if (chromium) return chromium
  }
  throw new Error(
    "Capturing needs a browser: 'yarn add -D @playwright/test', and PLAYWRIGHT_CHROMIUM_PATH (or PIKKU_CHROMIUM) for a chromium that is not Playwright's own"
  )
}

export const pagesCapture = pikkuSessionlessFunc({
  description:
    'Capture the original site a clone is rebuilt from, into the reference pages compare and the done gate read: first behaviour.json and <id>.behaviour.json (outside hosts, redirects, cookies by name, forms and an empty submit held back, interactions before and after, transitions), then every page from its sitemap and links, at each width, as <id>-<width>.jpg, .layout.json and .style.json, <id>.json (title, menu, headings, text, colours and fonts by use, pictures), and the original pictures downloaded into <out>/pictures/.',
  input: PagesCaptureInput,
  output: PagesCaptureOutput,
  func: async ({ config }, { url, out, viewports, page, jobs, tiles }) => {
    const site = await loadSiteCapture()
    if (!site?.capture || !site.pages || !site.downloadPictures)
      throw new Error(
        'The pikku-site-clone capture script (in @pikku/skills) could not be loaded next to the CLI'
      )
    const origin = new URL(url)
    const dir = resolve(
      out ??
        join(
          findWorkspaceRoot(config.rootDir),
          'artifacts',
          'references',
          origin.host
        )
    )
    mkdirSync(dir, { recursive: true })
    const only = page
      ?.split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => new URL(p, origin).href)
    const urls = only?.length ? only : await site.pages(url)
    if (!urls.length) urls.push(origin.href)
    writeFileSync(join(dir, 'pages.txt'), `${urls.join('\n')}\n`)
    const widths = (viewports ?? '1440,390,1920')
      .split(',')
      .map((w) => Number(w.trim()))
      .filter(Boolean)
    const log = (...parts: unknown[]) =>
      process.stderr.write(`${parts.join(' ')}\n`)
    log(
      dim(
        `Capturing ${urls.length} page(s) at ${widths.join(', ')} px into ${dir}: about a minute per page and width`
      )
    )
    const { pages, pictures } = await site
      .capture(dir, urls, widths, tiles ?? true, jobs ?? 4, {
        chromium: await loadChromium(),
        log,
      })
      .catch((error: Error) => {
        if (!/Executable doesn't exist|launch/i.test(String(error?.message)))
          throw error
        throw new Error(
          `No browser started for the capture: set PLAYWRIGHT_CHROMIUM_PATH or PIKKU_CHROMIUM to a chrome binary, or run 'npx playwright install chromium'. ${String(error.message).split('\n')[0]}`
        )
      })
    const rel = (file: string) => {
      const r = relative(process.cwd(), file) || '.'
      return r.startsWith('..') ? file : r
    }
    return {
      url,
      dir: rel(dir),
      widths,
      pages: pages.map(({ id, url }) => ({ id, url })),
      errors: pages.flatMap(({ id, viewports }) =>
        Object.entries(viewports)
          .filter(([, v]) => v.error)
          .map(([w, v]) => `${id} @${w}: ${v.error}`)
      ),
      pictures: pictures
        ? { ...pictures, dir: rel(pictures.dir) }
        : {
            listed: 0,
            downloaded: 0,
            failed: 0,
            dir: rel(join(dir, 'pictures')),
          },
    }
  },
})

export const renderPagesCapture = (
  _services: unknown,
  {
    url,
    dir,
    widths,
    pages,
    errors,
    pictures,
  }: z.infer<typeof PagesCaptureOutput>
): void => {
  process.stdout.write(
    `${url}: ${pages.length} page(s) at ${widths.join(', ')} px into ${dir}\n`
  )
  for (const error of errors)
    process.stdout.write(`  ${changed('✗')} ${error}\n`)
  process.stdout.write(
    `Pictures: ${pictures.downloaded} of ${pictures.listed} downloaded into ${pictures.dir}${pictures.failed ? changed(` (${pictures.failed} failed)`) : ''}; ${pictures.dir}/index.json maps each original address to its file, and each <page>.json lists its pictures with their file.\n`
  )
  process.stdout.write(
    [
      'Next:',
      `  Read ${dir}/<page>.json (menu, headings, text, coloursByUse, fontsByUse, pictures) and ${dir}/<page>-1440.layout.json before you build.`,
      `  Copy the pictures from ${pictures.dir} into the app's public folder and use them where the original does.`,
      `  Put the colours and fonts of ${dir}/<page>-1440.style.json in the theme.`,
      `  After each page: pikku ui pages compare --reference ${dir} --page <page>`,
    ].join('\n') + '\n'
  )
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
    // A page is named by its reference id (index, about) or by its route (/, /about), as a change's `Pages:` line writes it.
    const onlyIds = page
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) =>
        id.startsWith('/') ? id.replace(/^\/+|\/+$/g, '') || 'index' : id
      )
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
        `No reference screenshot in ${reference} for ${onlyIds?.length ? `page ${onlyIds.join(', ')} at ` : ''}width ${wanted.join(', ')}. Pages in the reference: ${[...new Set(readReference(refDir).map((shot) => shot.id))].slice(0, 12).join(', ')}`
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

    const dir = resolve(out ?? defaultCompareDir(root, target))
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
    const withStyle = shots.some((shot) => shot.style)
    const stylesNote = !withStyle
      ? 'The reference has no <id>-<width>.style.json (captured before styles were recorded), so there are no style differences; capture it again with pikku ui pages capture <url> --out <reference> to get them.'
      : siteCapture?.extractStyleInPage
        ? null
        : 'Style differences left out: the pikku-site-clone capture script (in @pikku/skills) could not be loaded to read our styles.'

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

    let served: Served | null = null
    let url = baseUrl
    if (present.length) {
      const driver = await loadDriver()
      if (!url) {
        const frontend = devFrontendFor(config.frontends, resolve(root, target))
        if (!frontend)
          throw new Error(
            `No --baseUrl, and ${target} has no frontends.<name>.dev (command, port, healthPath) in pikku.config.json to start it with. Pass --baseUrl.`
          )
        const apiPort = Object.values(config.backends ?? {}).find(
          (b) => b?.dev?.port
        )?.dev?.port
        served = await serveFrontend({
          frontend,
          // in a parallel loop's changeset worktree the configured ports may
          // be serving another checkout's code: start this tree's own servers
          isolate: await isolatedCompare(frontend.cwd),
          backend: ownBackend(config),
          apiUrl: apiPort ? `http://localhost:${apiPort}` : undefined,
          envFor: (f) =>
            frontendEnv(
              process.env,
              readEnvFile(join(config.rootDir, '.env')),
              f.cwd
            ),
        })
        url = served.baseUrl
      }
      const { session, close } = await openSession(
        { config, getInspectorState, variables },
        { baseUrl: url, as, environment, backend }
      ).catch(async (error) => {
        await served?.stop()
        throw error
      })
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
              const layout = withLayout
                ? await pwPage
                    .evaluate(siteCapture.extractInPage)
                    .catch(() => null)
                : null
              const style =
                withStyle && siteCapture.extractStyleInPage
                  ? await pwPage
                      .evaluate(siteCapture.extractStyleInPage)
                      .catch(() => null)
                  : null
              return { layout, style }
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
              const {
                diff,
                referenceHeight,
                ourHeight,
                referenceImageWidth,
                ourImageWidth,
              } = compareShot(shot, got.png)
              const diffFile = join(dir, `${shot.id}-${width}.diff.png`)
              writeFileSync(diffFile, diff.png)
              const inspected = got.inspected as {
                layout: object | null
                style: StyleSummary | null
              } | null
              let sections: CompareRow['sections'] = null
              if (siteCapture && shot.layout && inspected?.layout) {
                const mine = { viewport: width, ...inspected.layout }
                writeFileSync(
                  join(dir, `${shot.id}-${width}.layout.json`),
                  JSON.stringify(mine)
                )
                sections = siteCapture.sectionDiff(
                  JSON.parse(readFileSync(shot.layout, 'utf8')),
                  mine
                )
              }
              let styles: CompareRow['styles'] = null
              if (shot.style && inspected?.style) {
                writeFileSync(
                  join(dir, `${shot.id}-${width}.style.json`),
                  JSON.stringify(inspected.style, null, 1)
                )
                styles = styleDiff(
                  JSON.parse(readFileSync(shot.style, 'utf8')),
                  inspected.style
                )
              }
              rows.push({
                ...base,
                status: 'compared',
                changedPercent: diff.changedPercent,
                referenceHeight,
                ourHeight,
                heightDiff: ourHeight - referenceHeight,
                ...(referenceImageWidth !== width
                  ? { referenceImageWidth }
                  : {}),
                ...(ourImageWidth !== width ? { ourImageWidth } : {}),
                diff: rel(diffFile),
                ours: rel(oursFile),
                sections,
                styles,
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
        await served?.stop()
      }
    }

    // Which commit these pages were photographed at, so a later check (the
    // page gate on `pikku changes done`) can tell a fresh report from a stale one.
    const stamp = await gitStamp(resolve(root, target))
    const sorted = worstFirst(rows)
    const failed = overThreshold(sorted, threshold).map(
      (row) => `${row.id}@${row.width}`
    )
    const result = {
      app: target,
      baseUrl: url ?? 'none needed: every page is missing',
      server: served
        ? {
            started: served.started,
            command: served.command,
            apiNote: served.apiNote,
          }
        : null,
      reference: rel(refDir),
      dir: rel(dir),
      report: rel(join(dir, 'report.json')),
      widths: [...new Set(shots.map((shot) => shot.width))],
      threshold: threshold ?? null,
      ...stamp,
      generatedAt: new Date().toISOString(),
      sectionsNote,
      stylesNote,
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
    stylesNote,
    server,
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
      `  ${over ? changed(pct) : pct} ${label}  height ${row.ourHeight} vs ${row.referenceHeight} (${signed(row.heightDiff!)})${row.sections ? `  sections match ${row.sections.match}` : ''}${row.referenceImageWidth ? dim(`  original ${row.referenceImageWidth} px wide`) : ''}${row.ourImageWidth ? dim(`  ours ${row.ourImageWidth} px wide`) : ''}\n`
    )
    // style first: it names what to change without opening an image
    for (const style of row.styles ?? [])
      process.stdout.write(`        style  ${style.text}\n`)
    for (const note of row.sections?.notes.slice(0, 2) ?? [])
      process.stdout.write(`        ${dim(note)}\n`)
  }
  if (server?.started)
    process.stdout.write(
      `${dim(`Started ${server.command} for the compare and stopped it again.`)}\n`
    )
  if (server?.apiNote) process.stdout.write(`${changed(server.apiNote)}\n`)
  if (sectionsNote) process.stdout.write(`${dim(sectionsNote)}\n`)
  if (stylesNote) process.stdout.write(`${dim(stylesNote)}\n`)
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
