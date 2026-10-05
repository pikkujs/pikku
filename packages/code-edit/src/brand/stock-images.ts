export type StockImageOrientation = 'landscape' | 'portrait' | 'squarish'

export type StockImage = { url: string; alt: string | null; creditName: string; creditUrl: string }

/** Unsplash photo search with the caller's own access key. Unsplash's terms require crediting the photographer. */
export async function searchUnsplash(
  accessKey: string,
  options: { query: string; count?: number; orientation?: StockImageOrientation },
  get: typeof fetch = fetch
): Promise<StockImage[]> {
  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', options.query)
  url.searchParams.set('per_page', String(Math.min(Math.max(options.count ?? 8, 1), 30)))
  url.searchParams.set('orientation', options.orientation ?? 'landscape')
  url.searchParams.set('content_filter', 'high')
  const res = await get(url, {
    headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Unsplash search failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as {
    results?: Array<{
      alt_description: string | null
      urls?: { regular?: string; full?: string }
      user?: { name?: string; links?: { html?: string } }
    }>
  }
  return (data.results ?? []).flatMap((r) => {
    const photo = r.urls?.regular ?? r.urls?.full
    if (!photo) return []
    return [
      {
        url: photo,
        alt: r.alt_description ?? null,
        creditName: r.user?.name ?? 'Unsplash',
        creditUrl: r.user?.links?.html ?? 'https://unsplash.com',
      },
    ]
  })
}
