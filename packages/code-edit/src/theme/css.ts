import type { Density, Radius, Theme } from './presets.js'

export type Lch = { l: number; c: number; h: number }

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))

export function hexToLch(hex: string): Lch {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(a, bb)
  return { l: L, c, h: c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

function toLinearRgb({ l, c, h }: Lch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

const luminance = (color: Lch) => {
  const [r, g, b] = toLinearRgb(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: Lch, b: Lch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

export const formatLch = ({ l, c, h }: Lch) => `oklch(${clamp(l).toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`

export function lchToHex(color: Lch): string {
  return (
    '#' +
    toLinearRgb(color)
      .map((v) => Math.round(clamp(fromLinear(v)) * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

const WHITE: Lch = { l: 1, c: 0, h: 0 }

function reach(fg: Lch, bg: Lch, min: number): Lch {
  const direction = luminance(fg) >= luminance(bg) ? 1 : -1
  let next = fg
  for (let i = 0; i < 60 && contrast(next, bg) < min; i++) {
    next = { ...next, l: clamp(next.l + direction * 0.01) }
  }
  return next
}

function reachAgainst(fg: Lch, backgrounds: Lch[], min: number): Lch {
  return backgrounds.reduce((color, bg) => reach(color, bg, min), fg)
}

function readable(bg: Lch, ink: Lch): Lch {
  return contrast(WHITE, bg) >= contrast(ink, bg) ? WHITE : ink
}

const RADIUS: Record<Radius, string> = {
  '0': '0rem',
  xs: '0.25rem',
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
}

const DENSITY: Record<Density, string> = { compact: '0.22rem', comfortable: '0.25rem', roomy: '0.29rem' }

const SHADOW_KEYS = ['xs', 'sm', 'md', 'lg', 'xl'] as const

type Palette = Record<string, Lch>

function lightPalette(theme: Theme): Palette {
  const { primary, secondary, accent } = theme.brand.colors
  const brand = hexToLch(primary)
  const hue = brand.h
  const tint = Math.min(0.02, brand.c * 0.12)
  const background = theme.structure.page ? hexToLch(theme.structure.page) : { l: 1, c: 0, h: hue }
  const ink = theme.structure.ink ? hexToLch(theme.structure.ink) : { l: 0.16, c: tint, h: hue }
  const step = (delta: number): Lch => ({ l: clamp(background.l + delta), c: Math.max(tint, background.c), h: background.c > tint ? background.h : hue })
  const card = theme.structure.page ? background : WHITE
  const muted = step(-0.04)
  const secondaryFill = secondary ? hexToLch(secondary) : step(-0.06)
  const accentFill = accent ? hexToLch(accent) : step(-0.05)
  const inputEdge = reach(step(-0.3), background, 3)
  return {
    background,
    foreground: reach(ink, background, 7),
    card,
    'card-foreground': reach(ink, card, 7),
    popover: card,
    'popover-foreground': reach(ink, card, 7),
    primary: brand,
    'primary-foreground': readable(brand, ink),
    secondary: secondaryFill,
    'secondary-foreground': readable(secondaryFill, ink),
    muted,
    'muted-foreground': reachAgainst(step(-0.45), [background, muted], 4.6),
    accent: accentFill,
    'accent-foreground': readable(accentFill, ink),
    destructive: { l: 0.577, c: 0.245, h: 27.325 },
    border: step(-0.08),
    input: inputEdge,
    ring: reach(brand, background, 3),
  }
}

function darkPalette(theme: Theme): Palette {
  const { primary, secondary, accent } = theme.brand.colors
  const brand = hexToLch(primary)
  const hue = brand.h
  const tint = Math.min(0.02, brand.c * 0.12)
  const surface = theme.structure.darkSurface?.length === 10 ? theme.structure.darkSurface.map(hexToLch) : undefined
  const at = (index: number, fallback: number): Lch => surface?.[index] ?? { l: fallback, c: tint, h: hue }
  const background = at(7, 0.16)
  const card = at(6, 0.2)
  const muted = at(5, 0.25)
  const border = at(4, 0.3)
  const text = at(0, 0.96)
  const secondaryFill = secondary ? { ...hexToLch(secondary), l: clamp(hexToLch(secondary).l * 0.55) } : muted
  const accentFill = accent ? { ...hexToLch(accent), l: clamp(hexToLch(accent).l * 0.6) } : border
  const primaryOnDark = reach(brand, background, 3)
  return {
    background,
    foreground: reach(text, background, 7),
    card,
    'card-foreground': reach(text, card, 7),
    popover: card,
    'popover-foreground': reach(text, card, 7),
    primary: primaryOnDark,
    'primary-foreground': readable(primaryOnDark, at(9, 0.1)),
    secondary: secondaryFill,
    'secondary-foreground': readable(secondaryFill, at(9, 0.1)),
    muted,
    'muted-foreground': reachAgainst(at(2, 0.72), [background, muted], 4.6),
    accent: accentFill,
    'accent-foreground': readable(accentFill, at(9, 0.1)),
    destructive: { l: 0.704, c: 0.191, h: 22.216 },
    border,
    input: reach(at(3, 0.5), background, 3),
    ring: primaryOnDark,
  }
}

const block = (selector: string, palette: Palette, extra: string[] = []) =>
  [`${selector} {`, ...Object.entries(palette).map(([name, color]) => `  --${name}: ${formatLch(color)};`), ...extra, '}'].join('\n')

const family = (name?: string) => (name ? `'${name}', ` : '')

export function googleFontsHref(theme: Theme): string | undefined {
  const names = [...new Set([theme.brand.fonts?.heading, theme.brand.fonts?.body, theme.brand.fonts?.mono].filter(Boolean))] as string[]
  if (!names.length) return undefined
  const families = names.map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700`)
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

export function themeToCss(theme: Theme): string {
  const light = lightPalette(theme)
  const dark = darkPalette(theme)
  const chart = (palette: Palette): Record<string, Lch> => {
    const base = palette.primary!
    return {
      'chart-1': base,
      'chart-2': palette.secondary!.c > 0.02 ? palette.secondary! : { ...base, h: (base.h + 60) % 360 },
      'chart-3': palette.accent!.c > 0.02 ? palette.accent! : { ...base, h: (base.h + 150) % 360 },
      'chart-4': { ...base, h: (base.h + 210) % 360 },
      'chart-5': { ...base, h: (base.h + 280) % 360 },
    }
  }
  const radius = RADIUS[theme.structure.radius ?? 'md']
  const density = DENSITY[theme.structure.density ?? 'comfortable']
  const shadows = SHADOW_KEYS.flatMap((key) => {
    const value = theme.structure.shadows?.[key]
    return value ? [`  --theme-shadow-${key}: ${value};`] : []
  })
  const fonts = theme.brand.fonts
  const fontVars = [
    `  --theme-font-heading: ${family(fonts?.heading)}${family(fonts?.body)}ui-sans-serif, system-ui, sans-serif;`,
    `  --theme-font-body: ${family(fonts?.body)}ui-sans-serif, system-ui, sans-serif;`,
    `  --theme-font-mono: ${family(fonts?.mono)}ui-monospace, SFMono-Regular, monospace;`,
  ]
  const shared = [`  --radius: ${radius};`, `  --theme-spacing: ${density};`, ...fontVars, ...shadows]
  const names = [
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'destructive',
    'border',
    'input',
    'ring',
    'chart-1',
    'chart-2',
    'chart-3',
    'chart-4',
    'chart-5',
  ]
  const mapping = [
    ...names.map((name) => `  --color-${name}: var(--${name});`),
    '  --radius-sm: calc(var(--radius) - 4px);',
    '  --radius-md: calc(var(--radius) - 2px);',
    '  --radius-lg: var(--radius);',
    '  --radius-xl: calc(var(--radius) + 4px);',
    '  --spacing: var(--theme-spacing);',
    '  --font-sans: var(--theme-font-body);',
    '  --font-heading: var(--theme-font-heading);',
    '  --font-mono: var(--theme-font-mono);',
    ...SHADOW_KEYS.filter((key) => theme.structure.shadows?.[key]).map((key) => `  --shadow-${key}: var(--theme-shadow-${key});`),
  ]
  const fontsHref = googleFontsHref(theme)
  return [
    `/* Generated by \`pikku theme apply\` — do not edit. */`,
    ...(fontsHref ? [`@import url('${fontsHref}');`] : []),
    block(':root', { ...light, ...chart(light) }, [...shared, '  color-scheme: light;']),
    '',
    block('.dark', { ...dark, ...chart(dark) }, ['  color-scheme: dark;']),
    '',
    '@custom-variant dark (&:is(.dark *));',
    '',
    '@theme inline {',
    ...mapping,
    '}',
    '',
  ].join('\n')
}
