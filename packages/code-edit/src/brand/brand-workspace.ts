import { existsSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { ThemeInput } from '../theme/compose.js'
import { playwrightBrowser, type BrandBrowser } from './browser.js'
import { designProfileToThemeInput, extractFromTokensFile, extractFromUrl, normaliseSiteUrl, type DesignProfile } from './design-extract.js'
import { writeFavicon, type FaviconResult } from './favicon.js'
import { findFrontends, pickFrontend, type BrandFrontend, type FrontendConfig } from './frontends.js'
import { placeholderBrands, productBrand, type PlaceholderBrand } from './placeholder-brand.js'
import { saveRemoteImages } from './remote-images.js'
import { CloudflareCrawler, crawlSite, type CloudflareCredentials } from './site-crawl.js'
import { searchUnsplash, type StockImageOrientation } from './stock-images.js'

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
  unsplashAccessKey?: () => Promise<string | undefined>
  cloudflare?: () => Promise<CloudflareCredentials | undefined>
  fetch?: typeof fetch
}

export type StockImagesResult = {
  app: string
  query: string
  dir: string
  images: { path: string; alt: string | null; credit: string; creditUrl: string }[]
  failed: { src: string; reason: string }[]
  note: string
}

export type CrawlResult = {
  app: string
  ok: boolean
  status: string
  timedOut: boolean
  finished: number
  total: number
  imagesDownloaded: number
  imagesDir: string | null
  imageNote: string | null
  pages: { url: string; title: string | null; markdown: string; images: { src: string; alt: string | null }[] }[]
}

const MAX_MARKDOWN = 8000

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

  private apps() {
    const all = this.frontends()
    return [...all.filter((f) => f.primary), ...all.filter((f) => !f.primary)].map((f) => ({
      slug: basename(f.dir),
      dir: f.dir,
    }))
  }

  placeholders(): { productName: string | null; placeholders: PlaceholderBrand[] } {
    const apps = this.apps()
    return { productName: productBrand(apps), placeholders: placeholderBrands(this.workspaceRoot, apps) }
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

  async stockImages(input: { query: string; count?: number; orientation?: StockImageOrientation; app?: string }): Promise<StockImagesResult> {
    const query = input.query.trim()
    if (!query) throw new BrandError('A search query is required', 'invalid')
    const key = await this.options.unsplashAccessKey?.()
    if (!key) throw new BrandError('Stock images need an Unsplash access key: set UNSPLASH_ACCESS_KEY', 'unavailable')
    const frontend = this.frontend(input.app)
    const found = await searchUnsplash(key, { query, count: input.count, orientation: input.orientation }, this.options.fetch)
    const dir = join(frontend.dir, 'public', 'stock')
    const { saved, failed } = await saveRemoteImages(
      found.map((i) => i.url),
      dir,
      '/stock',
      { fetch: this.options.fetch }
    )
    const bySrc = new Map(found.map((i) => [i.url, i]))
    return {
      app: frontend.name,
      query,
      dir,
      images: saved.map(({ src, path }) => ({
        path,
        alt: bySrc.get(src)!.alt,
        credit: bySrc.get(src)!.creditName,
        creditUrl: bySrc.get(src)!.creditUrl,
      })),
      failed,
      note: saved.length
        ? "Unsplash's terms require crediting the photographer — add a discreet credit line from credit/creditUrl."
        : 'No images saved — try broader terms.',
    }
  }

  async crawl(input: { url: string; maxPages?: number; app?: string }): Promise<CrawlResult> {
    const credentials = await this.options.cloudflare?.()
    if (!credentials) {
      throw new BrandError('Crawling needs a Cloudflare account: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Browser Rendering: Edit)', 'unavailable')
    }
    const frontend = this.frontend(input.app)
    let url: string
    try {
      url = normaliseSiteUrl(input.url)
    } catch {
      throw new BrandError(`Invalid url: ${input.url}`, 'invalid')
    }
    const crawled = await crawlSite(new CloudflareCrawler(credentials, this.options.fetch), url, { maxPages: input.maxPages })
    const dir = join(frontend.dir, 'public', 'crawled')
    const srcs = crawled.pages.flatMap((p) => p.images.map((i) => i.src))
    const { saved, capped } = await saveRemoteImages(srcs, dir, '/crawled', { maxBytes: 6_000_000, timeoutMs: 15_000, fetch: this.options.fetch })
    const local = new Map(saved.map((s) => [s.src, s.path]))
    return {
      app: frontend.name,
      ok: crawled.status === 'completed',
      status: crawled.status,
      timedOut: !crawled.done,
      finished: crawled.finished,
      total: crawled.total,
      imagesDownloaded: saved.length,
      imagesDir: saved.length ? dir : null,
      imageNote: capped ? `Capped image download; ${capped} more left as remote URLs` : null,
      pages: crawled.pages.map((p) => ({
        url: p.url,
        title: p.title,
        markdown: p.markdown.length > MAX_MARKDOWN ? `${p.markdown.slice(0, MAX_MARKDOWN)}\n…[truncated]` : p.markdown,
        images: p.images.map((i) => ({ src: local.get(i.src) ?? i.src, alt: i.alt })),
      })),
    }
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
