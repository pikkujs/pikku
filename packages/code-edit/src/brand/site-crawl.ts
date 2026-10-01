const CF_API = 'https://api.cloudflare.com/client/v4'
const MAX_IMAGES_PER_PAGE = 20

export type CrawlImage = { src: string; alt: string | null }

export type CrawlPage = { url: string; title: string | null; markdown: string; images: CrawlImage[]; status: number | null }

export type CrawlSnapshot = {
  status: string
  finished: number
  total: number
  cursor: number | null
  pages: CrawlPage[]
}

export type CloudflareCredentials = { accountId: string; apiToken: string }

type CfEnvelope<T> = { success: boolean; result: T; errors?: unknown[] }
type CfCrawlResult = {
  status?: string
  total?: number
  finished?: number
  cursor?: number
  records?: Array<{ url: string; markdown?: string; html?: string; metadata?: { status?: number; title?: string } }>
}

/** The images a page's HTML shows: og/twitter images, img src/srcset, and CSS background images, absolutised and deduped. */
export function extractImages(html: string | undefined, baseUrl: string): CrawlImage[] {
  if (!html) return []
  const out: CrawlImage[] = []
  const seen = new Set<string>()
  const push = (rawSrc: string | undefined, alt: string | null) => {
    if (!rawSrc || out.length >= MAX_IMAGES_PER_PAGE) return
    const src = rawSrc.trim()
    if (!src || src.startsWith('data:')) return
    let abs: string
    try {
      abs = new URL(src, baseUrl).toString()
    } catch {
      return
    }
    if (!/^https?:/i.test(abs) || seen.has(abs)) return
    seen.add(abs)
    out.push({ src: abs, alt })
  }
  const attr = (tag: string, name: string): string | undefined =>
    (tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) || tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i')))?.[1]
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') || attr(m[0], 'name') || '').toLowerCase()
    if (key === 'og:image' || key === 'twitter:image') push(attr(m[0], 'content'), null)
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(m[0], 'src') || attr(m[0], 'data-src') || attr(m[0], 'srcset')?.split(',')[0]?.trim().split(/\s+/)[0]
    push(src, attr(m[0], 'alt') ?? null)
  }
  for (const m of html.matchAll(/background(?:-image)?\s*:[^;"']*url\((['"]?)([^'")]+)\1\)/gi)) push(m[2], null)
  for (const m of html.matchAll(/data-(?:bg|background)\s*=\s*(['"])([^'"]+)\1/gi)) push(m[2], null)
  return out
}

/** Cloudflare Browser Rendering's async crawl, on the caller's own account. The token needs `Browser Rendering: Edit`. */
export class CloudflareCrawler {
  constructor(
    private credentials: CloudflareCredentials,
    private get: typeof fetch = fetch
  ) {}

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await this.get(`${CF_API}/accounts/${this.credentials.accountId}/browser-rendering${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.credentials.apiToken}`, 'content-type': 'application/json' },
    })
    const text = await res.text()
    let body: CfEnvelope<T>
    try {
      body = JSON.parse(text) as CfEnvelope<T>
    } catch {
      throw new Error(`cloudflare browser-rendering ${path}: HTTP ${res.status} (${text.slice(0, 200)})`)
    }
    if (!res.ok || !body.success) {
      throw new Error(`cloudflare browser-rendering ${path}: HTTP ${res.status} ${JSON.stringify(body.errors ?? body)}`)
    }
    return body.result
  }

  async start(url: string, limit?: number): Promise<string> {
    return this.call<string>('/crawl', {
      method: 'POST',
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        options: { includeExternalLinks: false },
        ...(limit != null ? { limit } : {}),
      }),
    })
  }

  async poll(jobId: string, options: { limit?: number; cursor?: number } = {}): Promise<CrawlSnapshot> {
    const qs = new URLSearchParams()
    if (options.limit != null) qs.set('limit', String(options.limit))
    if (options.cursor != null) qs.set('cursor', String(options.cursor))
    const suffix = qs.size ? `?${qs}` : ''
    const result = await this.call<CfCrawlResult>(`/crawl/${encodeURIComponent(jobId)}${suffix}`, { method: 'GET' })
    return {
      status: result.status ?? 'running',
      finished: result.finished ?? 0,
      total: result.total ?? 0,
      cursor: result.cursor ?? null,
      pages: (result.records ?? []).map((r) => ({
        url: r.url,
        title: r.metadata?.title ?? null,
        markdown: r.markdown ?? '',
        images: extractImages(r.html, r.url),
        status: r.metadata?.status ?? null,
      })),
    }
  }
}

export type CrawlSiteResult = { status: string; done: boolean; finished: number; total: number; pages: CrawlPage[] }

/** Crawls a site to completion or the deadline, then pages through every record, dropping empty pages. */
export async function crawlSite(
  crawler: Pick<CloudflareCrawler, 'start' | 'poll'>,
  url: string,
  options: { maxPages?: number; timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<CrawlSiteResult> {
  const { maxPages = 20, timeoutMs = 180_000, pollMs = 4000 } = options
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const jobId = await crawler.start(url, maxPages)
  const deadline = Date.now() + timeoutMs
  let last: CrawlSnapshot = { status: 'running', finished: 0, total: 0, cursor: null, pages: [] }
  let done = false
  while (Date.now() < deadline) {
    last = await crawler.poll(jobId)
    done = last.status !== 'running' && last.status !== 'queued'
    if (done) break
    await sleep(pollMs)
  }
  const pages: CrawlPage[] = []
  const seen = new Set<string>()
  if (done) {
    let cursor: number | undefined
    for (let guard = 0; guard < 50; guard++) {
      const batch = await crawler.poll(jobId, { cursor, limit: 100 })
      for (const page of batch.pages) {
        if (seen.has(page.url)) continue
        seen.add(page.url)
        pages.push(page)
      }
      if (batch.cursor == null || batch.cursor === cursor || batch.pages.length === 0) break
      cursor = batch.cursor
    }
  }
  return {
    status: last.status,
    done,
    finished: last.finished,
    total: last.total,
    pages: pages.filter((p) => p.markdown.trim().length > 0 || p.images.length > 0),
  }
}
