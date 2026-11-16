import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import jpeg from 'jpeg-js'
import pngjs from 'pngjs'
import { git } from '../../utils/git.js'

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
  /** `<id>-<width>.style.json`, when the capture wrote one. */
  style: string | null
}

const SHOT = /^(.+)-(\d+)\.(jpe?g|png)$/i

export function readReference(dir: string): ReferenceShot[] {
  if (!existsSync(dir)) throw new Error(`--reference ${dir} does not exist`)
  const shots: ReferenceShot[] = []
  for (const name of readdirSync(dir).sort()) {
    const m = name.match(SHOT)
    if (!m || name.endsWith('.diff.png')) continue
    const layout = join(dir, `${m[1]}-${m[2]}.layout.json`)
    const style = join(dir, `${m[1]}-${m[2]}.style.json`)
    shots.push({
      id: m[1]!,
      width: Number(m[2]),
      file: join(dir, name),
      layout: existsSync(layout) ? layout : null,
      style: existsSync(style) ? style : null,
    })
  }
  if (!shots.length)
    throw new Error(
      `--reference ${dir} has no <id>-<width>.jpg or .png screenshots`
    )
  return shots
}

/** `index` and `home` are `/`; any other id is `/<id>`, with the capture script's `__` read back as `/`. A map entry wins. */
export function routeFor(id: string, map: Record<string, string> = {}): string {
  if (map[id] !== undefined) return map[id]!
  return id === 'index' || id === 'home' ? '/' : `/${id.replace(/__/g, '/')}`
}

/** Where `pages compare` writes by default: under the workspace, where an agent may read it (not `.pikku/`). */
export function defaultCompareDir(workspaceRoot: string, app: string): string {
  return join(workspaceRoot, 'artifacts', 'tmp', 'compare', basename(app))
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

/** One element's look, as the capture script's `extractStyleInPage` reads it. */
export interface ElementStyle {
  text?: string
  size: number
  weight: number
  color: string
  align: string
  family: string
  background?: string
}

/** `<id>-<width>.style.json`: what a reader notices first on a page. */
export interface StyleSummary {
  viewport?: number
  /** Screen pixels per CSS pixel, when the phone zoomed a page laid out narrower than itself (Wix: 320 on a 390 phone). */
  scale?: number
  pageBackground?: string | null
  header?: { height: number; background: string | null } | null
  contentWidth?: number | null
  elements?: Partial<Record<StyleElement, ElementStyle | null>>
}

export type StyleElement = 'h1' | 'h2' | 'h3' | 'p' | 'button'

/** One difference worth fixing, in plain words. */
export interface StyleDifference {
  what: string
  text: string
  weight: number
}

const STYLE_LABEL: Record<StyleElement, string> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  p: 'first paragraph',
  button: 'primary button/link',
}
const STYLE_IMPORTANCE: Record<StyleElement, number> = {
  h1: 1,
  h2: 0.8,
  button: 0.7,
  p: 0.6,
  h3: 0.5,
}

/**
 * A CSS colour as `#rrggbb` (`rgb()`, `rgba()` laid over white, `#rgb`,
 * `#rrggbb`); anything else comes back as given, lower case.
 */
export function toHex(colour: string | null | undefined): string | null {
  if (!colour) return null
  const c = colour.trim().toLowerCase()
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  const rgb = c.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
  )
  if (rgb) {
    const raw = rgb[4]
    const a =
      raw === undefined
        ? 1
        : raw.endsWith('%')
          ? parseFloat(raw) / 100
          : parseFloat(raw)
    const over = (v: string) => Number(v) * a + 255 * (1 - a)
    return `#${hex(over(rgb[1]!))}${hex(over(rgb[2]!))}${hex(over(rgb[3]!))}`
  }
  if (/^#[0-9a-f]{3}$/.test(c))
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  if (/^#[0-9a-f]{8}$/.test(c)) return c.slice(0, 7)
  if (c === 'transparent') return '#ffffff'
  if (c === 'white') return '#ffffff'
  if (c === 'black') return '#000000'
  return c
}

/** Distance between two colours, 0 (same) to about 765; a colour that is not plain RGB is 0 when equal, else 100. */
export function colourDistance(a: string | null, b: string | null): number {
  const x = toHex(a)
  const y = toHex(b)
  if (!x || !y) return 0
  if (!/^#[0-9a-f]{6}$/.test(x) || !/^#[0-9a-f]{6}$/.test(y))
    return x === y ? 0 : 100
  const ch = (h: string, i: number) =>
    parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  // "redmean": a cheap weighting close to how far apart the eye puts them
  const r = (ch(x, 0) + ch(y, 0)) / 2
  const dr = ch(x, 0) - ch(y, 0)
  const dg = ch(x, 1) - ch(y, 1)
  const db = ch(x, 2) - ch(y, 2)
  return Math.sqrt(
    (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db
  )
}

/** Colours further apart than this are a difference a reader notices. */
export const NOTICEABLE_COLOUR = 60
/** A tint over a whole background shows at a smaller distance (white and a cream #fdf3f1 are about 30 apart). */
export const NOTICEABLE_BACKGROUND = 20

/** A font name without its web-font decorations: `playfair-display-v2` and `Playfair Display` are one font. */
export function fontName(family: string): string {
  return family
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w &&
        !/^(v\d+|w\d+|\d+|regular|normal|bold|light|medium|semibold|italic|web|webfont)$/.test(
          w
        )
    )
    .join(' ')
}

/** Sizes in screen pixels, font names plain. */
function onScreen(s: StyleSummary): StyleSummary {
  const k = s.scale && s.scale > 0 ? s.scale : 1
  const px = (n: number) => Math.round(n * k * 10) / 10
  const elements: StyleSummary['elements'] = {}
  for (const [key, e] of Object.entries(s.elements ?? {}))
    elements[key as StyleElement] = e
      ? { ...e, size: px(e.size), family: fontName(e.family ?? '') }
      : null
  return {
    ...s,
    scale: 1,
    header: s.header
      ? { ...s.header, height: Math.round(s.header.height * k) }
      : s.header,
    contentWidth: s.contentWidth
      ? Math.round(s.contentWidth * k)
      : s.contentWidth,
    elements,
  }
}

const sizeOff = (a: number, b: number) =>
  a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) - 1 : 0

/**
 * The style differences that matter between the original and our page, worst
 * first, at most `max`: a font size off by more than 10%, a weight 100 or more
 * apart, a noticeably different colour, another alignment or font, a header or
 * text column more than 10% off, and the page background.
 */
export function styleDiff(
  ref: StyleSummary,
  mine: StyleSummary,
  max = 6
): StyleDifference[] {
  ref = onScreen(ref)
  mine = onScreen(mine)
  const out: StyleDifference[] = []
  // only backgrounds are compared with far(): a tint over an area shows sooner than in a letter
  const far = (a?: string | null, b?: string | null) =>
    !!a && !!b && colourDistance(a, b) > NOTICEABLE_BACKGROUND

  if (far(ref.pageBackground, mine.pageBackground))
    out.push({
      what: 'page background',
      text: `page background: original ${toHex(ref.pageBackground)}; yours ${toHex(mine.pageBackground)}`,
      weight:
        0.9 *
        Math.min(
          2,
          colourDistance(ref.pageBackground!, mine.pageBackground!) / 150
        ),
    })

  if (ref.header) {
    const h = mine.header
    if (!h)
      out.push({
        what: 'header',
        text: `header: original ${ref.header.height}px tall, ${toHex(ref.header.background)}; yours has no <header>`,
        weight: 0.6,
      })
    else {
      const off = sizeOff(ref.header.height, h.height)
      const bg = far(ref.header.background, h.background)
      if (off > 0.15 || bg)
        out.push({
          what: 'header',
          text: `header: original ${ref.header.height}px tall, ${toHex(ref.header.background)}; yours ${h.height}px tall, ${toHex(h.background)}`,
          weight:
            0.6 *
            (Math.min(1, off) +
              (bg
                ? Math.min(
                    2,
                    colourDistance(ref.header.background, h.background) / 150
                  )
                : 0)),
        })
    }
  }

  if (
    ref.contentWidth &&
    mine.contentWidth &&
    sizeOff(ref.contentWidth, mine.contentWidth) > 0.1
  )
    out.push({
      what: 'text column',
      text: `text column: original ${ref.contentWidth}px wide; yours ${mine.contentWidth}px`,
      weight: 0.6 * Math.min(1.5, sizeOff(ref.contentWidth, mine.contentWidth)),
    })

  for (const key of Object.keys(STYLE_LABEL) as StyleElement[]) {
    const a = ref.elements?.[key]
    if (!a) continue
    const b = mine.elements?.[key]
    const label = STYLE_LABEL[key]
    const look = (e: ElementStyle, family: boolean, bg: boolean) =>
      `${+e.size.toFixed(1)}px ${e.weight} ${toHex(e.color)}${key === 'button' ? '' : ` ${e.align}`}${family ? ` "${e.family}"` : ''}${bg && e.background ? ` on ${toHex(e.background)}` : ''}`
    if (!b) {
      out.push({
        what: key,
        text: `${label}: original ${look(a, true, false)}${a.text ? ` ("${a.text.slice(0, 30)}")` : ''}; yours has no visible ${key === 'button' ? 'button' : key}`,
        weight: STYLE_IMPORTANCE[key] * 1.2,
      })
      continue
    }
    const size = sizeOff(a.size, b.size)
    const weight = Math.abs(a.weight - b.weight)
    const colour = colourDistance(a.color, b.color)
    // a link's text-align says nothing about where the button sits
    const align = key !== 'button' && a.align !== b.align
    const family = !!a.family && !!b.family && a.family !== b.family
    const bg = far(a.background, b.background)
    const score =
      (size > 0.1 ? Math.min(1.5, size * 2) : 0) +
      (weight >= 100 ? weight / 300 : 0) +
      (colour > NOTICEABLE_COLOUR ? Math.min(2, colour / 150) : 0) +
      (align ? 0.5 : 0) +
      (family ? 0.3 : 0) +
      (bg ? Math.min(2, colourDistance(a.background!, b.background!) / 150) : 0)
    if (score === 0) continue
    out.push({
      what: key,
      text: `${label}: original ${look(a, family, bg)}; yours ${look(b, family, bg)}`,
      weight: STYLE_IMPORTANCE[key] * score,
    })
  }
  return out
    .sort((x, y) => y.weight - x.weight)
    .slice(0, max)
    .map((d) => ({ ...d, weight: +d.weight.toFixed(2) }))
}

export interface SiteCapture {
  extractInPage: () => unknown
  /** Older capture scripts have none. */
  extractStyleInPage?: () => unknown
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
  /** Style differences that matter, worst first; null when there was no style to compare. */
  styles?: StyleDifference[] | null
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

/**
 * The commit a compare ran at and whether the frontend had uncommitted changes
 * (untracked files count): the pages photographed are HEAD only when it did
 * not. Both null outside a git checkout.
 */
export async function gitStamp(
  appDir: string,
  run: (args: string[], cwd: string) => Promise<string> = git
): Promise<{ gitSha: string | null; dirty: boolean | null }> {
  try {
    const gitSha = (await run(['rev-parse', 'HEAD'], appDir)).trim()
    const status = await run(['status', '--porcelain', '--', '.'], appDir)
    return { gitSha, dirty: status.trim().length > 0 }
  } catch {
    return { gitSha: null, dirty: null }
  }
}
