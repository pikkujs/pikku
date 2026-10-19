import {
  createTheme,
  defaultVariantColorsResolver,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
  type VariantColorsResolver,
} from '@mantine/core'
import { generateColors } from '@mantine/colors-generator'
import active from './active.json'
import { themeSpecs } from './themes'

const FONT_FALLBACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const MONO_FALLBACK =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"

// Mono families need a monospace fallback chain, not the sans-serif one — else a
// terminal/matrix theme degrades to a proportional font before the webfont loads.
const isMonoFamily = (family: string): boolean => /\bmono\b|consol|courier/i.test(family)

// A theme is ONE Mantine theme, authored as two clearly-labelled sections:
//   brand     — HIGH-LEVEL: colour palette + fonts (what makes apps look different)
//   structure — LOW-LEVEL Mantine: radius, shadows, spacing, component defaults
// buildMantineTheme takes the structure as the base and EXTENDS it with the
// brand, then that single merged object is registered with MantineProvider.
export type Brand = {
  colors?: Record<string, string>
  fonts?: { heading?: string; body?: string; mono?: string }
}

export type Structure = {
  defaultRadius?: string
  autoContrast?: boolean
  primaryShade?: number | { light?: number; dark?: number }
  shadows?: Record<string, string>
  spacing?: Record<string, string>
  radius?: Record<string, string>
  components?: Record<string, unknown>
  // The style's natural scheme — seeds ColorSchemeScript + MantineProvider so a
  // light style renders light and a dark style dark by default. NOT a createTheme
  // key, so it is stripped before the theme is built.
  defaultColorScheme?: 'light' | 'dark' | 'auto'
  // An explicit 10-step Mantine `dark` tuple used verbatim (idx0 lightest text →
  // idx7 body bg → idx9 deepest). When present it overrides the auto-tint so a
  // dark-first style gets its exact background. NOT a createTheme key.
  darkColors?: string[]
}

export type Theme = {
  name: string
  description?: string
  brand?: Brand
  structure?: Structure
}

// Back-compat alias: older imports referred to a colours-only "Palette".
export type Palette = Theme

const fontStack = (family?: string): string | undefined =>
  family ? `'${family}', ${isMonoFamily(family) ? MONO_FALLBACK : FONT_FALLBACK}` : undefined

// Brand-tinted dark surfaces. Mantine's dark scheme derives the body, surfaces,
// borders and inputs from the `dark` colour tuple; the default ramp is neutral
// grey, so every app looked identical regardless of the brand colour. We rebuild
// the dark ramp at the brand's HUE so the whole background takes on the theme —
// keeping text shades (0..3) near-neutral for contrast and saturating the deep
// background shades (6..9) for a clearly distinct, on-brand dark look.
const hexToHsl = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s * 100, l * 100]
}

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Lightness/saturation anchors per dark-tuple index (0 = lightest text → 9 =
// deepest background). dark[7] is the body background in Mantine's dark scheme.
// Text shades (0..3) stay near-neutral for readable contrast; the surface and
// background shades (5..9) carry real brand saturation so the dark UI reads as a
// rich, on-brand dark — NOT the flat near-grey it used to be (the "all gray" bug).
const DARK_L = [96, 88, 77, 62, 48, 36, 25, 17, 12, 9]
// Restrained saturation: just enough hue to read as on-brand, never the lurid
// over-saturated background that made dark apps look "absurd". Dark-first styles
// that want a precise background ship an explicit `darkColors` tuple instead.
const DARK_S = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26]

// Below this saturation a brand reads as greyscale (e.g. a mono/neutral theme);
// tinting it at its near-arbitrary hue would turn the whole UI an off-colour
// (a grey seed sits at hue 0 → a red-tinted dark). Keep those neutral.
const MIN_TINT_SATURATION = 12

const tintedDarkTuple = (hex: string): MantineColorsTuple | null => {
  const hsl = hexToHsl(hex)
  if (!hsl) return null
  const [h, s] = hsl
  if (s < MIN_TINT_SATURATION) return null
  return DARK_L.map((l, i) => hslToHex(h, DARK_S[i]!, l)) as unknown as MantineColorsTuple
}

// Mantine's default resolver bakes the LIGHT scheme into filled text and the
// `-light` variant vars, which breaks themes whose light/dark primary shades sit
// at opposite ramp ends (neutral ink/chalk brands) — route the primary colour's
// filled text and subtle background through the per-scheme primary vars instead.
const variantColorResolver: VariantColorsResolver = (input) => {
  const defaults = defaultVariantColorsResolver(input)
  const { color, variant, theme } = input
  const isPrimary = !color || color === theme.primaryColor
  if (!isPrimary) return defaults
  if (variant === 'filled') {
    return { ...defaults, color: 'var(--mantine-primary-color-contrast)' }
  }
  if (variant === 'light') {
    return {
      ...defaults,
      background: 'color-mix(in srgb, var(--mantine-primary-color-filled) 10%, transparent)',
      hover: 'color-mix(in srgb, var(--mantine-primary-color-filled) 15%, transparent)',
    }
  }
  return defaults
}

// structure (base) → extend with brand (colours + fonts) → one Mantine theme.
export const buildMantineTheme = (spec: Theme): MantineThemeOverride => {
  // Pull the two non-Mantine fields out of structure before it is spread into
  // createTheme — they drive scheme/dark-tuple, not the theme object.
  const {
    defaultColorScheme: _scheme,
    darkColors,
    ...structureRest
  } = (spec.structure ?? {}) as Structure
  const structure = structureRest as MantineThemeOverride
  const brand = spec.brand ?? {}
  const colors: Record<string, MantineColorsTuple> = Object.fromEntries(
    Object.entries(brand.colors ?? {}).map(([role, hex]) => [role, generateColors(hex)]),
  )
  // An explicit dark tuple (from a dark-first style) wins verbatim; otherwise tint
  // the dark surfaces/background at the brand hue so apps still look distinct.
  const dark =
    darkColors && darkColors.length === 10
      ? (darkColors as unknown as MantineColorsTuple)
      : brand.colors?.primary
        ? tintedDarkTuple(brand.colors.primary)
        : null
  if (dark) colors.dark = dark
  const body = fontStack(brand.fonts?.body)
  const heading = fontStack(brand.fonts?.heading ?? brand.fonts?.body)
  const mono = fontStack(brand.fonts?.mono)
  // Mantine's default dark primaryShade is 8 — a deep, muted tone that reads as
  // near-grey against the dark background, so buttons/accents/the logo all looked
  // washed out (the other half of the "all gray" bug). Force a vibrant shade in
  // dark mode so the brand actually pops; honour an explicit theme override.
  // Cast to Mantine's narrow MantineColorShade union — structure JSON types the
  // shade loosely as number, which the literal 0–9 union rejects.
  const specShade = (spec.structure ?? {}).primaryShade
  const primaryShade = (specShade ?? { light: 6, dark: 5 }) as MantineThemeOverride['primaryShade']
  return createTheme({
    ...structure,
    primaryShade,
    variantColorResolver,
    ...(body ? { fontFamily: body } : {}),
    ...(heading ? { headings: { fontFamily: heading } } : {}),
    ...(mono ? { fontFamilyMonospace: mono } : {}),
    ...(Object.keys(colors).length ? { colors } : {}),
    // Drive the primary colour from the brand. Previously a theme could define
    // colours that Mantine never used as the primary — that was the "themes
    // don't react" bug.
    ...('primary' in colors ? { primaryColor: 'primary' } : {}),
  })
}

// Back-compat alias for callers that pass a spec.
export const buildTheme = buildMantineTheme

// Mantine's default LIGHT-mode `dimmed`/`placeholder` map to gray-6 (#868e96 ≈
// 3.5:1 on white) and gray-5 — both FAIL WCAG AA 4.5:1 for the subtitles, card
// labels, empty-state bodies and input placeholders that use `c="dimmed"`. That
// low-contrast secondary text is the #1 recurring a11y finding across generated
// apps. Darken the light-mode tokens to ~6:1 (dimmed) / ~4.9:1 (placeholder) —
// still clearly secondary, now readable. Dark mode already derives dimmed from a
// light tuple shade, so leave it to the per-theme resolver.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-dimmed': '#5c636b', // ~6:1 on white
    '--mantine-color-placeholder': '#6b7280', // ~4.9:1 on white
  },
  dark: {},
})

const specs = themeSpecs as Record<string, Theme>

export const themes: Record<string, MantineThemeOverride> = Object.fromEntries(
  Object.entries(specs).map(([id, s]) => [id, buildMantineTheme(s)]),
)

export const themeList = Object.entries(specs).map(([id, s]) => ({
  id,
  name: s.name,
  description: s.description,
}))

export const activeId = active.id
export const activeTheme: MantineThemeOverride = themes[active.id] ?? themes.default
export const theme = activeTheme

// The natural color scheme each theme declares, so the app can seed
// ColorSchemeScript + MantineProvider to match (a light style boots light, a dark
// style dark). Defaults to 'dark' (the template's historical default).
export type ColorScheme = 'light' | 'dark' | 'auto'
export const themeColorSchemes: Record<string, ColorScheme> = Object.fromEntries(
  Object.entries(specs).map(([id, s]) => [id, s.structure?.defaultColorScheme ?? 'dark']),
)
export const activeColorScheme: ColorScheme = themeColorSchemes[active.id] ?? 'dark'

// Distinct font families referenced by any theme, for the <head> Google Fonts
// <link> so a theme's typography actually renders.
export const brandFontFamilies: string[] = [
  ...new Set(
    Object.values(specs).flatMap((s) => {
      const f = s.brand?.fonts ?? {}
      return [f.body, f.heading, f.mono].filter((x): x is string => Boolean(x))
    }),
  ),
]

export const googleFontsHref = (families: string[] = brandFontFamilies): string | null => {
  if (!families.length) return null
  const params = families
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}
