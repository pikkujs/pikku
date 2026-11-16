import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import jpeg from 'jpeg-js'
import pngjs from 'pngjs'

const { PNG } = pngjs

/** An RGBA image: 4 bytes per pixel, row by row. */
export interface Rgba {
  width: number
  height: number
  data: Uint8Array
}

/** Decode a PNG or a JPEG (told apart by their first bytes). */
export function decodeImage(bytes: Uint8Array): Rgba {
  const buf = Buffer.from(bytes)
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const png = PNG.sync.read(buf)
    return { width: png.width, height: png.height, data: png.data }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const img = jpeg.decode(buf, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 2048,
      maxResolutionInMP: 400,
    })
    return { width: img.width, height: img.height, data: img.data }
  }
  throw new Error('not a PNG or a JPEG')
}

export function encodePng(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length)
  return PNG.sync.write(png)
}

/** Scale to `width`, keeping the proportions: an area average going down, the nearest pixel going up. */
export function scaleToWidth(img: Rgba, width: number): Rgba {
  if (img.width === width) return img
  const scale = img.width / width
  const height = Math.max(1, Math.round(img.height / scale))
  const out = new Uint8Array(width * height * 4)
  if (scale < 1) {
    for (let y = 0; y < height; y++) {
      const sy = Math.min(img.height - 1, Math.floor(y * scale))
      for (let x = 0; x < width; x++) {
        const sx = Math.min(img.width - 1, Math.floor(x * scale))
        const s = (sy * img.width + sx) * 4
        out.set(img.data.subarray(s, s + 4), (y * width + x) * 4)
      }
    }
    return { width, height, data: out }
  }
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * scale)
    const y1 = Math.min(
      img.height,
      Math.max(y0 + 1, Math.floor((y + 1) * scale))
    )
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * scale)
      const x1 = Math.min(
        img.width,
        Math.max(x0 + 1, Math.floor((x + 1) * scale))
      )
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const s = (yy * img.width + xx) * 4
          r += img.data[s]!
          g += img.data[s + 1]!
          b += img.data[s + 2]!
          a += img.data[s + 3]!
        }
      const n = (y1 - y0) * (x1 - x0)
      const o = (y * width + x) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
      out[o + 3] = a / n
    }
  }
  return { width, height, data: out }
}

export interface ImageDiff {
  /** The width both images were compared at. */
  width: number
  /** Share of the compared area (the taller page's height) whose pixels differ, 0-100. */
  changedPercent: number
  /** The diff image: reference | changed pixels in red | ours, side by side. */
  png: Buffer
}

const GAP = 6

/**
 * Compare two page screenshots: both scaled to the same width (at most
 * `maxWidth`), aligned at the top. A pixel is changed when a colour channel
 * differs by more than `tolerance` (0-255; JPEG noise and font smoothing stay
 * under it). Where one page has ended and the other goes on, every pixel is
 * changed, so a page much shorter or longer than the reference scores badly.
 */
export function diffImages(
  reference: Rgba,
  ours: Rgba,
  {
    maxWidth = 640,
    tolerance = 40,
  }: { maxWidth?: number; tolerance?: number } = {}
): ImageDiff {
  const width = Math.max(1, Math.min(maxWidth, reference.width, ours.width))
  const a = scaleToWidth(reference, width)
  const b = scaleToWidth(ours, width)
  const height = Math.max(a.height, b.height)
  const outW = width * 3 + GAP * 2
  const out = new Uint8Array(outW * height * 4).fill(255)
  for (let i = 3; i < out.length; i += 4) out[i] = 255
  for (let y = 0; y < height; y++)
    for (let g = 0; g < GAP; g++)
      for (const x of [width + g, width * 2 + GAP + g])
        out.set([200, 200, 200, 255], (y * outW + x) * 4)
  let changed = 0
  for (let y = 0; y < height; y++) {
    const inA = y < a.height
    const inB = y < b.height
    if (inA)
      out.set(a.data.subarray(y * width * 4, (y + 1) * width * 4), y * outW * 4)
    if (inB)
      out.set(
        b.data.subarray(y * width * 4, (y + 1) * width * 4),
        (y * outW + 2 * (width + GAP)) * 4
      )
    for (let x = 0; x < width; x++) {
      const o = (y * outW + width + GAP + x) * 4
      let differs = !(inA && inB)
      if (!differs) {
        const p = (y * width + x) * 4
        for (let c = 0; c < 3 && !differs; c++)
          differs = Math.abs(a.data[p + c]! - b.data[p + c]!) > tolerance
      }
      if (differs) {
        changed++
        out.set(inA && inB ? [230, 30, 30, 255] : [250, 150, 150, 255], o)
      } else {
        // the reference, faded, so the red reads against it
        const p = (y * width + x) * 4
        for (let c = 0; c < 3; c++) out[o + c] = 190 + (a.data[p + c]! >> 2)
        out[o + 3] = 255
      }
    }
  }
  return {
    width,
    changedPercent: +((changed / (width * height)) * 100).toFixed(2),
    png: encodePng({ width: outW, height, data: out }),
  }
}

/** One reference screenshot: `<id>-<width>.(jpg|jpeg|png)` in the reference folder. */
export interface ReferenceShot {
  id: string
  width: number
  file: string
  layout: string | null
}

const SHOT = /^(.+)-(\d+)\.(jpe?g|png)$/i

export function readReference(dir: string): ReferenceShot[] {
  if (!existsSync(dir)) throw new Error(`--reference ${dir} does not exist`)
  const shots: ReferenceShot[] = []
  for (const name of readdirSync(dir).sort()) {
    const m = name.match(SHOT)
    if (!m || name.endsWith('.diff.png')) continue
    const layout = join(dir, `${m[1]}-${m[2]}.layout.json`)
    shots.push({
      id: m[1]!,
      width: Number(m[2]),
      file: join(dir, name),
      layout: existsSync(layout) ? layout : null,
    })
  }
  if (!shots.length)
    throw new Error(
      `--reference ${dir} has no <id>-<width>.jpg or .png screenshots`
    )
  return shots
}

/** `index` is `/`; any other id is `/<id>`, with the capture script's `__` read back as `/`. A map entry wins. */
export function routeFor(id: string, map: Record<string, string> = {}): string {
  if (map[id] !== undefined) return map[id]!
  return id === 'index' ? '/' : `/${id.replace(/__/g, '/')}`
}

/** Does a concrete path match one of the app's route paths (`$param` one segment, a bare `$` the rest)? */
export function routeExists(path: string, routes: string[]): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '') || '/'
  const target = norm(path)
  return routes.some((route) => {
    const pattern = norm(route)
      .split('/')
      .map((seg) =>
        seg === '$'
          ? '.+'
          : seg.startsWith('$')
            ? '[^/]+'
            : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      .join('/')
    return new RegExp(`^${pattern}$`).test(target)
  })
}

export interface SectionDiff {
  match: number
  notes: string[]
}

export interface SiteCapture {
  extractInPage: () => unknown
  settle: (page: unknown) => Promise<void>
  sectionDiff: (ref: unknown, mine: unknown) => SectionDiff
}

/**
 * The pikku-site-clone skill's capture script, which made the reference: its
 * in-page layout extraction runs on our page too, and its section diff
 * compares the two. Null when the skill is not installed next to the CLI.
 */
export async function loadSiteCapture(): Promise<SiteCapture | null> {
  try {
    const root = dirname(
      createRequire(import.meta.url).resolve('@pikku/skills/package.json')
    )
    const script = join(
      root,
      'skills',
      'pikku-site-clone',
      'scripts',
      'site_capture.mjs'
    )
    const mod = await import(pathToFileURL(script).href)
    if (mod.extractInPage && mod.settle && mod.sectionDiff)
      return mod as SiteCapture
  } catch {}
  return null
}

export interface CompareRow {
  id: string
  width: number
  path: string
  status: 'compared' | 'missing' | 'error'
  changedPercent: number | null
  referenceHeight: number | null
  ourHeight: number | null
  /** Image widths, when they differ from `width`: the page is wider than the viewport (it overflows). */
  referenceImageWidth?: number
  ourImageWidth?: number
  heightDiff: number | null
  httpStatus: number | null
  diff: string | null
  ours: string | null
  sections: SectionDiff | null
  error?: string
}

/** Worst first: missing pages and errors, then by changed share. */
export function worstFirst(rows: CompareRow[]): CompareRow[] {
  const score = (row: CompareRow) =>
    row.status === 'compared' ? row.changedPercent! : 1000
  return [...rows].sort(
    (x, y) =>
      score(y) - score(x) || x.id.localeCompare(y.id) || x.width - y.width
  )
}

/** Rows over the threshold; a missing page or an error always counts. */
export function overThreshold(
  rows: CompareRow[],
  threshold?: number
): CompareRow[] {
  if (threshold === undefined) return []
  return rows.filter(
    (row) => row.status !== 'compared' || row.changedPercent! > threshold
  )
}

/** Compare one of our screenshots with its reference. */
export function compareShot(
  ref: ReferenceShot,
  ours: Uint8Array,
  opts?: { maxWidth?: number; tolerance?: number }
): {
  diff: ImageDiff
  referenceHeight: number
  ourHeight: number
  referenceImageWidth: number
  ourImageWidth: number
} {
  const a = decodeImage(readFileSync(ref.file))
  const b = decodeImage(ours)
  const diff = diffImages(a, b, opts)
  // Both are full-page screenshots at a device scale of 1, so their pixel
  // heights are CSS pixels; not rescaled, since an image wider than its
  // viewport is a page that overflows sideways, not a different scale.
  return {
    diff,
    referenceHeight: a.height,
    ourHeight: b.height,
    referenceImageWidth: a.width,
    ourImageWidth: b.width,
  }
}
