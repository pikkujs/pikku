import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const IMG_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
}

/** A numbered, filesystem-safe filename for a downloaded image. */
export function imageFileName(url: string, index: number, contentType: string, maxLength = 60): string {
  let name = basename(new URL(url).pathname) || `img-${index}`
  name = name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-maxLength)
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(name)) name += IMG_EXT[contentType] ?? '.jpg'
  return `${String(index).padStart(2, '0')}-${name}`
}

export type SavedImage = { src: string; path: string }

/**
 * Downloads images into `dir` (served at `urlPrefix`), skipping non-images, empty and oversized bodies.
 * Returns what was saved and why anything was not.
 */
export async function saveRemoteImages(
  urls: string[],
  dir: string,
  urlPrefix: string,
  options: { maxImages?: number; maxBytes?: number; timeoutMs?: number; fetch?: typeof fetch } = {}
): Promise<{ saved: SavedImage[]; failed: { src: string; reason: string }[]; capped: number }> {
  const { maxImages = 60, maxBytes = 8_000_000, timeoutMs = 20_000, fetch: get = fetch } = options
  const unique = [...new Set(urls)]
  const saved: SavedImage[] = []
  const failed: { src: string; reason: string }[] = []
  if (unique.length) mkdirSync(dir, { recursive: true })
  let index = 0
  for (const src of unique.slice(0, maxImages)) {
    index++
    try {
      const res = await get(src, { signal: AbortSignal.timeout(timeoutMs) })
      const contentType = (res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType || 'no content-type'})`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength === 0 || buf.byteLength > maxBytes) throw new Error(`size ${buf.byteLength} bytes`)
      const file = imageFileName(src, index, contentType)
      writeFileSync(join(dir, file), buf)
      saved.push({ src, path: `${urlPrefix.replace(/\/$/, '')}/${file}` })
    } catch (error) {
      failed.push({ src, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { saved, failed, capped: Math.max(0, unique.length - maxImages) }
}
