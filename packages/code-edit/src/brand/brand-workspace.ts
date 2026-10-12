import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { ThemeInput } from '../theme/compose.js'
import { playwrightBrowser, type BrandBrowser } from './browser.js'
import { designProfileToThemeInput, extractFromTokensFile, extractFromUrl, type DesignProfile } from './design-extract.js'
import { writeFavicon, type FaviconResult } from './favicon.js'
import { findFrontends, pickFrontend, type BrandFrontend, type FrontendConfig } from './frontends.js'

export class BrandError extends Error {
  constructor(
    message: string,
    public readonly kind: 'invalid' | 'missing' | 'unavailable'
  ) {
    super(message)
  }
}

export type BrandWorkspaceOptions = {
  frontends?: FrontendConfig
  browser?: () => BrandBrowser
}

/** A project's brand assets across its frontends: placeholder names, icons, design tokens and imagery. */
export class BrandWorkspace {
  constructor(
    private workspaceRoot: string,
    private options: BrandWorkspaceOptions = {}
  ) {}

  frontends(): BrandFrontend[] {
    return findFrontends(this.workspaceRoot, this.options.frontends)
  }

  frontend(name?: string): BrandFrontend {
    try {
      return pickFrontend(this.frontends(), name)
    } catch (error) {
      throw new BrandError((error as Error).message, 'missing')
    }
  }

  async favicon(input: { app?: string; source?: string; emoji?: string; letter?: string; background?: string }): Promise<FaviconResult & { app: string }> {
    const frontend = this.frontend(input.app)
    let source: string | undefined
    if (input.source) {
      const candidates = isAbsolute(input.source)
        ? [input.source]
        : [join(frontend.dir, input.source), join(frontend.dir, 'public', input.source), join(this.workspaceRoot, input.source)]
      source = candidates.find((c) => existsSync(c))
      if (!source) {
        throw new BrandError(`Source not found: ${input.source} (looked relative to the app, its public/, and the workspace root)`, 'missing')
      }
    }
    return this.withBrowser(async (browser) => ({
      app: frontend.name,
      ...(await writeFavicon(browser, { ...input, source, appDir: frontend.dir })),
    }))
  }

  async extract(input: { url?: string; file?: string; preset?: string }): Promise<{ profile: DesignProfile; theme: ThemeInput }> {
    const url = input.url?.trim()
    const file = input.file?.trim()
    if (!url === !file) throw new BrandError('Give exactly one of a url or a tokens file', 'invalid')
    let profile: DesignProfile
    if (file) {
      const path = isAbsolute(file) ? file : join(this.workspaceRoot, file)
      if (!existsSync(path)) throw new BrandError(`File not found: ${file}`, 'missing')
      try {
        profile = extractFromTokensFile(path)
      } catch (error) {
        throw new BrandError(`Could not parse ${file} as design tokens: ${(error as Error).message}`, 'invalid')
      }
    } else {
      profile = await this.withBrowser((browser) => extractFromUrl(browser, url!))
    }
    return { profile, theme: designProfileToThemeInput(profile, input.preset) }
  }

  private async withBrowser<T>(fn: (browser: BrandBrowser) => Promise<T>): Promise<T> {
    const browser = this.options.browser?.() ?? playwrightBrowser([this.workspaceRoot])
    try {
      return await fn(browser)
    } finally {
      await browser.close().catch(() => {})
    }
  }
}
