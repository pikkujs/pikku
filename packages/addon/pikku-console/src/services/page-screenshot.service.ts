import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BadRequestError } from '@pikku/core/errors'
import { navigablePaths, type PagesService } from '@pikku/code-edit/routes'

type PlaywrightDriver = {
  openPageSession: (
    appUrl: string
  ) => Promise<{ session: unknown; close: () => Promise<void> }>
  screenshotPages: (options: {
    session: unknown
    paths: string[]
    fullPage?: boolean
  }) => Promise<
    {
      path: string
      png: Uint8Array | null
      httpStatus: number | null
      error?: string
      issues: {
        apiErrors: string[]
        pageErrors: string[]
        consoleErrors: string[]
      }
    }[]
  >
}

/** One page as the browser saw it: a base64 PNG, or why there is none. */
export interface PageScreenshotResult {
  path: string
  png: string | null
  httpStatus: number | null
  error?: string
  problems: string[]
}

export interface PageScreenshotInput {
  baseUrl: string
  app?: string
  paths?: string[]
  params?: Record<string, string>
  viewport?: boolean
}

export interface PageScreenshotOutput {
  app: string
  shots: PageScreenshotResult[]
  skipped: { path: string; params: string[] }[]
}

const DRIVER = '@pikku/playwright'

/** Photographs a running frontend's pages, signed out, through the `@pikku/playwright` the project installs. */
export class PageScreenshotService {
  private driver: Promise<PlaywrightDriver> | undefined

  constructor(
    private pages: PagesService,
    private projectRoot: string
  ) {}

  async capture({
    baseUrl,
    app,
    paths,
    params,
    viewport,
  }: PageScreenshotInput): Promise<PageScreenshotOutput> {
    if (!/^https?:\/\//.test(baseUrl))
      throw new BadRequestError('baseUrl must be an http(s) url')
    if (paths?.some((p) => !p.startsWith('/') || p.startsWith('//')))
      throw new BadRequestError(
        'paths must be origin-relative, starting with /'
      )
    const pages = await this.pages.list(app ? [app] : undefined)
    const apps = [...new Set(pages.map((page) => page.app))]
    const target = app ?? (apps.length === 1 ? apps[0] : undefined)
    if (!target)
      throw new BadRequestError(
        apps.length
          ? `Several frontends have routes (${apps.join(', ')}); pass app`
          : 'No frontend has TanStack file routes under src/routes'
      )
    const { paths: navigable, skipped } = navigablePaths(
      pages.filter((page) => page.app === target),
      params
    )
    const driver = await this.loadDriver()
    const { session, close } = await driver.openPageSession(baseUrl)
    try {
      const shots = await driver.screenshotPages({
        session,
        paths: paths?.length ? paths : navigable,
        fullPage: !viewport,
      })
      return {
        app: target,
        shots: shots.map(({ path, png, httpStatus, error, issues }) => ({
          path,
          png: png ? Buffer.from(png).toString('base64') : null,
          httpStatus,
          ...(error ? { error } : {}),
          problems: [
            ...issues.apiErrors.map((e) => `API ${e}`),
            ...issues.pageErrors.map((e) => `threw: ${e}`),
            ...issues.consoleErrors.map((e) => `console: ${e}`),
          ],
        })),
        skipped: skipped.map(({ path, params }) => ({ path, params })),
      }
    } finally {
      await close()
    }
  }

  private loadDriver(): Promise<PlaywrightDriver> {
    this.driver ??= this.importDriver().catch((err) => {
      this.driver = undefined
      throw new BadRequestError(
        `Screenshots need ${DRIVER} and @playwright/test installed in the project: ${err instanceof Error ? err.message : String(err)}`
      )
    })
    return this.driver
  }

  private async importDriver(): Promise<PlaywrightDriver> {
    try {
      const fromProject = createRequire(
        join(this.projectRoot, 'package.json')
      ).resolve(DRIVER)
      return (await import(pathToFileURL(fromProject).href)) as PlaywrightDriver
    } catch {
      return (await import(DRIVER)) as PlaywrightDriver
    }
  }
}
