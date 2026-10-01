import {
  createTheme,
  defaultVariantColorsResolver,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
  type VariantColorsResolver,
} from '@mantine/core'
import { generateColors } from '@mantine/colors-generator'

export type ColorScheme = 'light' | 'dark' | 'auto'

/** Colours and fonts: what makes one app look different from another. */
export type Brand = {
  colors?: Record<string, string>
  fonts?: { heading?: string; body?: string; mono?: string }
}

/** Low-level Mantine theme keys, plus two that steer the scheme rather than createTheme. */
export type Structure = {
  defaultRadius?: string
  autoContrast?: boolean
  primaryShade?: number | { light?: number; dark?: number }
  shadows?: Record<string, string>
  spacing?: Record<string, string>
  radius?: Record<string, string>
  components?: Record<string, unknown>
  defaultColorScheme?: ColorScheme
  /** A verbatim 10-step `dark` tuple, overriding the brand-tinted one. */
  darkColors?: string[]
}

/** One theme as stored in `packages/mantine-theme/themes/<id>.json`. */
export type ThemeSpec = {
  name: string
  description?: string
  brand?: Brand
  structure?: Structure
}

const FONT_FALLBACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const MONO_FALLBACK =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"

const isMonoFamily = (family: string): boolean => /\bmono\b|consol|courier/i.test(family)

const fontStack = (family?: string): string | undefined =>
  family ? `'${family}', ${isMonoFamily(family) ? MONO_FALLBACK : FONT_FALLBACK}` : undefined

const hexToHsl = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1]!, 16)
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

const DARK_L = [96, 88, 77, 62, 48, 36, 25, 17, 12, 9]
const DARK_S = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26]
const MIN_TINT_SATURATION = 12

/** Mantine's dark ramp rebuilt at the brand's hue, so dark apps don't all share one grey; near-grey brands stay neutral. */
const tintedDarkTuple = (hex: string): MantineColorsTuple | null => {
  const hsl = hexToHsl(hex)
  if (!hsl) return null
  const [h, s] = hsl
  if (s < MIN_TINT_SATURATION) return null
  return DARK_L.map((l, i) => hslToHex(h, DARK_S[i]!, l)) as unknown as MantineColorsTuple
}

/** Routes the primary colour's filled text and light background through per-scheme vars, which Mantine bakes to the light scheme. */
const variantColorResolver: VariantColorsResolver = (input) => {
  const defaults = defaultVariantColorsResolver(input)
  const { color, variant, theme } = input
  if (color && color !== theme.primaryColor) return defaults
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

/** The structure as the base, extended with the brand, as one Mantine theme. */
export const buildTheme = (spec: ThemeSpec): MantineThemeOverride => {
  const { defaultColorScheme: _scheme, darkColors, ...structure } = spec.structure ?? {}
  const brand = spec.brand ?? {}
  const colors: Record<string, MantineColorsTuple> = Object.fromEntries(
    Object.entries(brand.colors ?? {}).map(([role, hex]) => [role, generateColors(hex)])
  )
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
  const primaryShade = (structure.primaryShade ?? { light: 6, dark: 5 }) as MantineThemeOverride['primaryShade']
  return createTheme({
    ...(structure as MantineThemeOverride),
    primaryShade,
    variantColorResolver,
    ...(body ? { fontFamily: body } : {}),
    ...(heading ? { headings: { fontFamily: heading } } : {}),
    ...(mono ? { fontFamilyMonospace: mono } : {}),
    ...(Object.keys(colors).length ? { colors } : {}),
    ...('primary' in colors ? { primaryColor: 'primary' } : {}),
  })
}

/** Darkens light-mode `dimmed` and `placeholder` to pass WCAG AA; Mantine's defaults sit near 3.5:1 on white. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-dimmed': '#5c636b',
    '--mantine-color-placeholder': '#6b7280',
  },
  dark: {},
})

export const googleFontsHref = (families: string[]): string | null => {
  if (!families.length) return null
  const params = families
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

/** Everything an app needs from its theme package, built from the stored specs and the active id. */
export const themeRegistry = (themeSpecs: Record<string, unknown>, activeId: string) => {
  const specs = themeSpecs as Record<string, ThemeSpec>
  const themes: Record<string, MantineThemeOverride> = Object.fromEntries(
    Object.entries(specs).map(([id, s]) => [id, buildTheme(s)])
  )
  const themeColorSchemes: Record<string, ColorScheme> = Object.fromEntries(
    Object.entries(specs).map(([id, s]) => [id, s.structure?.defaultColorScheme ?? 'dark'])
  )
  const brandFontFamilies = [
    ...new Set(
      Object.values(specs).flatMap((s) => {
        const f = s.brand?.fonts ?? {}
        return [f.body, f.heading, f.mono].filter((x): x is string => Boolean(x))
      })
    ),
  ]
  const activeTheme = themes[activeId] ?? themes.default!
  return {
    themes,
    themeList: Object.entries(specs).map(([id, s]) => ({ id, name: s.name, description: s.description })),
    activeId,
    activeTheme,
    theme: activeTheme,
    themeColorSchemes,
    activeColorScheme: themeColorSchemes[activeId] ?? 'dark',
    brandFontFamilies,
  }
}
