import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { BrandBrowser } from './browser.js'

export type IconSpec = { size: number; filename: string }

export const FAVICON_PNG = 'favicon-196.png'
export const APPLE_ICON_PNG = 'apple-icon-180.png'
export const ICONS: IconSpec[] = [
  { size: 196, filename: FAVICON_PNG },
  { size: 180, filename: APPLE_ICON_PNG },
  { size: 192, filename: 'manifest-icon-192.png' },
  { size: 512, filename: 'manifest-icon-512.png' },
]
export const DEFAULT_ICON_BACKGROUND = '#4c6ef5'

export type FaviconOptions = {
  appDir: string
  source?: string
  emoji?: string
  letter?: string
  background?: string
}

export type FaviconResult = {
  source: string
  publicDir: string
  generated: string[]
  faviconIco: boolean
  tags: string[]
  injectedInto: string | null
  tagsAdded: string[]
  note: string
}

const escapeMarkup = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

/** A dark or light glyph colour for legibility on `bg`. */
export function contrastText(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1]!, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#111111' : '#ffffff'
}

/** A 512px square SVG: the glyph centred on the background. */
export function glyphSvg(glyph: string, background: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${escapeMarkup(background)}"/>
  <text x="256" y="272" text-anchor="middle" dominant-baseline="central" font-family="'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji','Liberation Sans',Arial,sans-serif" font-size="300" font-weight="700" fill="${contrastText(background)}">${escapeMarkup(glyph)}</text>
</svg>`
}

/** The page a square icon is rasterised from: the image framed on the background with `padding` (0..0.5) inset. */
export function iconHtml(image: Uint8Array, mime: string, background: string, padding: number): string {
  const dataUri = `data:${mime};base64,${Buffer.from(image).toString('base64')}`
  const inset = `${Math.round(Math.max(0, Math.min(0.5, padding)) * 100)}%`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%}
    body{background:${escapeMarkup(background)};display:flex;align-items:center;justify-content:center;padding:${inset}}
    img{width:100%;height:100%;object-fit:contain;display:block}
  </style></head><body><img src="${dataUri}"></body></html>`
}

/** A single-image ICO wrapping the PNG as-is; every modern browser reads PNG-payload ICOs. */
export function pngToIco(png: Uint8Array, size: number): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, Buffer.from(png)])
}

type Tag = Record<string, string>

const htmlTag = (t: Tag) => `<link ${Object.entries(t).map(([k, v]) => `${k}="${v}"`).join(' ')}>`
const jsxTag = (t: Tag) => `<link ${Object.entries(t).map(([k, v]) => `${k}="${v}"`).join(' ')} />`

const DATA_ICON_RE = /(?:\s*\{\/\*(?:(?!\*\/)[\s\S])*\*\/\})?(?:\s*<link\s+rel="icon"[^>]*?href="data:[^"]*"[^>]*?\/?>)+/g

/**
 * Adds the icon links to the app's document head, skipping any whose href is already there and dropping inline data-URI icons that would shadow them.
 * Handles a Vite `index.html` and a TanStack Start `src/routes/__root.tsx` rendering `<HeadContent />`.
 */
export function injectIconTags(appDir: string, tags: Tag[]): { file: string | null; added: string[]; note: string } {
  const indexPath = join(appDir, 'index.html')
  const rootPath = join(appDir, 'src', 'routes', '__root.tsx')
  const target = existsSync(indexPath)
    ? { file: 'index.html', path: indexPath, anchor: /<\/head>/i, render: htmlTag, before: true }
    : existsSync(rootPath)
      ? { file: 'src/routes/__root.tsx', path: rootPath, anchor: /<HeadContent\s*\/>/, render: jsxTag, before: false }
      : null
  if (!target) {
    return { file: null, added: [], note: 'No index.html or src/routes/__root.tsx — icons were written but no tags were injected.' }
  }
  const original = readFileSync(target.path, 'utf8')
  const match = target.anchor.exec(original)
  if (!match) {
    return {
      file: null,
      added: [],
      note: `${target.file} has no ${target.before ? '</head>' : '<HeadContent />'} — icons were written but no tags were injected.`,
    }
  }
  const missing = tags.filter((t) => !original.includes(`"${t.href}"`))
  const stripped = missing.length ? original.replace(DATA_ICON_RE, '') : original
  if (!missing.length) {
    return { file: target.file, added: [], note: `All icon tags were already in ${target.file}.` }
  }
  const at = target.anchor.exec(stripped)!
  const lineStart = stripped.lastIndexOf('\n', at.index) + 1
  const indent = /^\s*/.exec(stripped.slice(lineStart, at.index))![0]
  const rendered = missing.map(target.render)
  const html = target.before
    ? `${stripped.slice(0, at.index)}${rendered.map((t) => `  ${t}\n${indent}`).join('')}${stripped.slice(at.index)}`
    : `${stripped.slice(0, at.index + at[0].length)}${rendered.map((t) => `\n${indent}${t}`).join('')}${stripped.slice(at.index + at[0].length)}`
  writeFileSync(target.path, html, 'utf8')
  return { file: target.file, added: rendered, note: `Injected ${rendered.length} tag(s) into ${target.file}.` }
}

/** Renders the favicon, apple-touch and PWA icon set into the app's public/, builds favicon.ico, and links them from the document head. */
export async function writeFavicon(browser: BrandBrowser, options: FaviconOptions): Promise<FaviconResult> {
  const background = options.background?.trim() || DEFAULT_ICON_BACKGROUND
  const publicDir = join(options.appDir, 'public')
  let html: string
  let source: string
  if (options.source) {
    const mime = MIME[extname(options.source).toLowerCase()] ?? 'image/png'
    html = iconHtml(readFileSync(options.source), mime, background, 0.1)
    source = options.source
  } else {
    const glyph = options.emoji || (options.letter ? options.letter.slice(0, 2) : 'A')
    html = iconHtml(Buffer.from(glyphSvg(glyph, background)), 'image/svg+xml', background, 0)
    source = `synthesized (${glyph} on ${background})`
  }
  mkdirSync(publicDir, { recursive: true })
  const generated: string[] = []
  let faviconPng: Uint8Array | undefined
  for (const { size, filename } of ICONS) {
    const png = await browser.screenshot(html, size)
    writeFileSync(join(publicDir, filename), png)
    generated.push(filename)
    if (filename === FAVICON_PNG) faviconPng = png
  }
  if (faviconPng) {
    writeFileSync(join(publicDir, 'favicon.ico'), pngToIco(faviconPng, 196))
    generated.push('favicon.ico')
  }
  const tags: Tag[] = [
    ...(faviconPng ? [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }] : []),
    { rel: 'icon', type: 'image/png', sizes: '196x196', href: `/${FAVICON_PNG}` },
    { rel: 'apple-touch-icon', href: `/${APPLE_ICON_PNG}` },
  ]
  const injected = injectIconTags(options.appDir, tags)
  return {
    source,
    publicDir,
    generated,
    faviconIco: !!faviconPng,
    tags: tags.map(htmlTag),
    injectedInto: injected.file,
    tagsAdded: injected.added,
    note: injected.note,
  }
}
