import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import type { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  discoverPages,
  navigablePaths,
  type AppPage,
} from '@pikku/code-edit/routes'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'
import { added, changed, dim } from '../../fabric/lib/output.js'
import {
  PagesListInput,
  PagesListOutput,
  PagesScreenshotInput,
  PagesScreenshotOutput,
} from './pages.schemas.js'
import {
  DEFAULT_BROWSER_DRIVER,
  resolveScenarioBrowserProvider,
} from './scenario-browser.js'
import { resolveEnvironment } from './environment.js'
import { resolvePersonas } from '../../utils/resolve-personas.js'
import { resolvePersonaCredentials } from '../../utils/persona-credentials.js'

type PlaywrightDriver = typeof import('@pikku/playwright')

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
    'Photograph every page of one frontend on a running server. Pages whose params have no value are skipped; pass --params to fill them, and --as to sign in as a persona first.',
  input: PagesScreenshotInput,
  output: PagesScreenshotOutput,
  func: async (
    { config, getInspectorState, variables },
    { baseUrl, app, out, params, as, environment = 'local', viewport }
  ) => {
    const root = findWorkspaceRoot(config.rootDir)
    const all = await discoverPages(root, app ? { apps: [app] } : {})
    const target = oneApp(all, app)
    const { paths, skipped } = navigablePaths(
      all.filter((page) => page.app === target),
      parseParams(params)
    )
    const driverName = DEFAULT_BROWSER_DRIVER
    const driver = (await import(driverName).catch(() => {
      throw new Error(
        `Screenshots need '${driverName}'. Run 'yarn add -D ${driverName} @playwright/test'.`
      )
    })) as PlaywrightDriver

    let session: InstanceType<PlaywrightDriver['ActorSession']>
    let close: () => Promise<void>
    if (as) {
      const state = await getInspectorState(true, false, false, true)
      const env = resolveEnvironment({
        environment,
        environments: config.environments ?? {},
        appUrl: baseUrl,
      })
      const provider = await resolveScenarioBrowserProvider({
        environment,
        apiUrl: env.apiUrl,
        appUrl: baseUrl,
        ...(await resolvePersonaCredentials(variables, 'page screenshots')),
        actors: resolvePersonas(
          state.personas?.definitions ?? [],
          config.scenarios?.emailDomain
        ),
        signInPath: env.signInPath,
        browserScenarios: ['pages screenshot'],
        driver: config.scenarios?.browserDriver,
      })
      session = (await provider.sessionFor(as)) as typeof session
      close = () => provider.close()
    } else {
      ;({ session, close } = await driver.openPageSession(baseUrl))
    }

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
      process.stdout.write(`      ${dim(problem.split('\n')[0]!.slice(0, 160))}\n`)
  }
  if (skipped.length) {
    process.stdout.write(
      `${dim(`Skipped ${skipped.length} needing a param value (--params name=value):`)}\n`
    )
    for (const page of skipped)
      process.stdout.write(`  ${page.path} ${dim(page.params.join(', '))}\n`)
  }
}
