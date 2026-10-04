import { readFileSync } from 'node:fs'
import type { ThemeInput } from '../theme/compose.js'
import type { BrandBrowser } from './browser.js'

/** A flat design profile: colours and fonts map onto a theme, structure is advisory. */
export type DesignProfile = {
  colors: {
    primary?: string
    secondary?: string
    accent?: string
    background?: string
    surface?: string
    text?: string
  }
  fonts: { heading?: string; body?: string }
  structure: {
    radius?: string
    shadowStrength?: 'none' | 'soft' | 'medium' | 'hard'
    density?: 'airy' | 'comfortable' | 'compact'
    borders?: 'none' | 'hairline' | 'bold'
  }
  source: string
  notes: string[]
}

/** Self-contained page script returning colours, fonts and structure inferred from a rendered page's computed styles. */
export const DESIGN_EXTRACTOR_SCRIPT = `(() => {
  const toHex = (c) => {
    if (!c) return undefined
    const m = c.match(/rgba?\\(([^)]+)\\)/)
    if (!m) {
      if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
      return /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : undefined
    }
    const p = m[1].split(',').map((s) => parseFloat(s.trim()))
    const [r, g, b, a] = p
    if (a !== undefined && a < 0.05) return undefined
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
    return '#' + h(r) + h(g) + h(b)
  }
  const sat = (hex) => {
    if (!hex) return 0
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    return max === 0 ? 0 : (max - min) / max
  }
  const px = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  const sample = (sel, n) => Array.from(document.querySelectorAll(sel)).slice(0, n)
  const median = (arr) => {
    const a = arr.filter((x) => x !== undefined).sort((x, y) => x - y)
    return a.length ? a[Math.floor(a.length / 2)] : undefined
  }

  const bodyCs = getComputedStyle(document.body)
  const background = toHex(bodyCs.backgroundColor)
  const text = toHex(bodyCs.color)
  const body = bodyCs.fontFamily

  const h = document.querySelector('h1, h2, h3')
  const heading = h ? getComputedStyle(h).fontFamily : body

  const rootVars = {}
  try {
    const rootCs = getComputedStyle(document.documentElement)
    for (const name of rootCs) {
      if (name.startsWith('--')) {
        const val = rootCs.getPropertyValue(name).trim()
        if (val) rootVars[name] = val
      }
    }
  } catch (e) {}

  const candidates = []
  const pushColor = (raw, weight) => {
    const hex = toHex(raw)
    if (hex && sat(hex) > 0.12) candidates.push({ hex, weight })
  }
  for (const b of sample('button, .btn, [class*="button"], [type="submit"]', 12)) {
    pushColor(getComputedStyle(b).backgroundColor, 3)
  }
  for (const a of sample('a', 20)) pushColor(getComputedStyle(a).color, 1)
  for (const [name, val] of Object.entries(rootVars)) {
    if (/primary|brand|accent|secondary/i.test(name)) pushColor(val, 4)
  }

  const byHex = {}
  for (const c of candidates) byHex[c.hex] = (byHex[c.hex] || 0) + c.weight * (0.5 + sat(c.hex))
  const ranked = Object.entries(byHex).sort((a, b) => b[1] - a[1]).map(([hex]) => hex)
  const [primary, secondary, accent] = ranked

  let surface
  for (const el of sample('[class*="card"], [class*="panel"], article, section', 10)) {
    const bg = toHex(getComputedStyle(el).backgroundColor)
    if (bg && bg !== background) { surface = bg; break }
  }

  const radii = [], shadows = [], borders = [], padsY = []
  for (const el of sample('button, .btn, [class*="button"], [class*="card"], [class*="panel"]', 24)) {
    const cs = getComputedStyle(el)
    radii.push(px(cs.borderTopLeftRadius))
    const sh = cs.boxShadow
    if (sh && sh !== 'none') {
      const nums = (sh.match(/-?\\d+(\\.\\d+)?px/g) || []).map(px)
      shadows.push(nums[2] || 0)
    } else shadows.push(0)
    borders.push(px(cs.borderTopWidth))
    padsY.push(px(cs.paddingTop))
  }
  const medRadius = median(radii)
  const medShadow = median(shadows) || 0
  const medBorder = median(borders) || 0
  const medPad = median(padsY) || 0

  const shadowStrength = medShadow === 0 ? 'none' : medShadow < 6 ? 'soft' : medShadow < 20 ? 'medium' : 'hard'
  const borderKind = medBorder === 0 ? 'none' : medBorder <= 1.5 ? 'hairline' : 'bold'
  const density = medPad === 0 ? undefined : medPad < 8 ? 'compact' : medPad < 16 ? 'comfortable' : 'airy'

  return {
    colors: { primary, secondary, accent, background, surface, text },
    fonts: { heading, body },
    structure: {
      radius: medRadius === undefined ? undefined : medRadius + 'px',
      shadowStrength,
      density,
      borders: borderKind,
    },
  }
})()`

function prune<T extends Record<string, any>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v === undefined || v === null || v === '') delete obj[k]
    else if (typeof v === 'object' && !Array.isArray(v)) {
      prune(v)
      if (Object.keys(v).length === 0 && k !== 'colors' && k !== 'fonts' && k !== 'structure') delete obj[k]
    }
  }
  return obj
}

/** The first family in a CSS font stack, unquoted. */
export function primaryFont(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  const first = stack
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '')
  return first || undefined
}

/** An http(s) URL from a site address, defaulting a bare host to https. */
export function normaliseSiteUrl(url: string): string {
  const trimmed = url.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) throw new Error(`Not a web address: ${url}`)
  return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString()
}

/** Reduces a live site's rendered styles to a DesignProfile. */
export async function extractFromUrl(browser: BrandBrowser, url: string): Promise<DesignProfile> {
  const target = normaliseSiteUrl(url)
  const raw = await browser.evaluate<Omit<DesignProfile, 'source' | 'notes'> | undefined>(target, DESIGN_EXTRACTOR_SCRIPT)
  if (!raw) throw new Error('in-page extraction returned no data')
  const notes: string[] = []
  if (!raw.colors?.primary) notes.push('No confident brand colour found — pick one that fits.')
  return prune({
    colors: raw.colors ?? {},
    fonts: { heading: primaryFont(raw.fonts?.heading), body: primaryFont(raw.fonts?.body) },
    structure: raw.structure ?? {},
    source: `url:${target}`,
    notes,
  })
}

type DtcgNode = { $value?: unknown; $type?: unknown; value?: unknown; type?: unknown } & Record<string, unknown>
type Token = { path: string[]; type: string; value: string }

function collectTokens(node: DtcgNode, path: string[], out: Token[]): void {
  if (!node || typeof node !== 'object') return
  const value = node.$value ?? node.value
  const type = node.$type ?? node.type
  if (value !== undefined) {
    let flat: string | undefined
    if (typeof value === 'string' || typeof value === 'number') flat = String(value)
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) flat = value.join(', ')
    if (flat !== undefined) {
      out.push({ path, type: typeof type === 'string' ? type : '', value: flat })
      return
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue
    if (v && typeof v === 'object') collectTokens(v as DtcgNode, [...path, k], out)
  }
}

const looksLikeColor = (t: Token): boolean =>
  t.type === 'color' || /^#([0-9a-f]{3,8})$/i.test(t.value.trim()) || /^(rgb|hsl)a?\(/i.test(t.value)

const looksLikeFont = (t: Token): boolean =>
  t.type === 'fontFamily' || t.type === 'fontFamilies' || /font.?famil/i.test(t.path.join('.'))

const key = (p: string[]) => p.join('.').toLowerCase()

function pick(pool: Token[], hints: RegExp): string | undefined {
  return (pool.find((t) => hints.test(key(t.path))) ?? pool[0])?.value
}

const COLOR_ROLES: [keyof DesignProfile['colors'], RegExp, boolean][] = [
  ['primary', /primary|brand/, true],
  ['secondary', /secondary/, true],
  ['accent', /accent|highlight/, true],
  ['background', /background|surface|bg|neutral/, false],
  ['text', /text|foreground|ink|fg/, false],
]

function pickColors(pool: Token[]): DesignProfile['colors'] {
  const used = new Set<string>()
  const colors: DesignProfile['colors'] = {}
  for (const [role, hints] of COLOR_ROLES) {
    const hit = pool.find((t) => hints.test(key(t.path)) && !used.has(t.value))
    if (hit) {
      colors[role] = hit.value
      used.add(hit.value)
    }
  }
  for (const [role, , fallback] of COLOR_ROLES) {
    if (colors[role] || !fallback) continue
    const hit = pool.find((t) => !used.has(t.value) && !COLOR_ROLES.some(([, hints]) => hints.test(key(t.path))))
    if (hit) {
      colors[role] = hit.value
      used.add(hit.value)
    }
  }
  return colors
}

/** Reduces a W3C design-tokens (DTCG) document to a DesignProfile, matching roles by token-name hints. */
export function extractFromTokens(json: unknown, source: string): DesignProfile {
  const tokens: Token[] = []
  collectTokens(json as DtcgNode, [], tokens)
  const colors = tokens.filter(looksLikeColor)
  const fonts = tokens.filter(looksLikeFont)
  const notes: string[] = []
  if (colors.length === 0) notes.push('No colour tokens found — inferring nothing.')
  return prune({
    colors: pickColors(colors),
    fonts: {
      heading: primaryFont(pick(fonts, /heading|display|title/)),
      body: primaryFont(pick(fonts, /body|base|text|default/)),
    },
    structure: {},
    source,
    notes,
  })
}

/** Reads and reduces a DTCG tokens.json file. */
export function extractFromTokensFile(filePath: string): DesignProfile {
  return extractFromTokens(JSON.parse(readFileSync(filePath, 'utf8')), `file:${filePath}`)
}

const HEX = /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$/
const hex = (value: string | undefined) => (value && HEX.test(value.trim()) ? value.trim() : undefined)

/** The `composeTheme` input a profile implies: its hex colours, fonts, page and ink over the given preset. */
export function designProfileToThemeInput(profile: DesignProfile, preset?: string): ThemeInput {
  const { colors, fonts } = profile
  return {
    ...(preset ? { preset } : {}),
    colors: { primary: hex(colors.primary), secondary: hex(colors.secondary), accent: hex(colors.accent) },
    fonts: { heading: fonts.heading, body: fonts.body },
    ...(hex(colors.background) ? { page: hex(colors.background) } : {}),
    ...(hex(colors.text) ? { ink: hex(colors.text) } : {}),
  }
}
