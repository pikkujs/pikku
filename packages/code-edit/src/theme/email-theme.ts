import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Theme } from './presets.js'

type EmailTheme = {
  appName?: string
  fonts: { body: string }
  colors: {
    canvas: string
    surface: string
    border: string
    text: string
    muted: string
    accent: string
    button: string
    buttonText: string
  }
}

/** The template's dark default, kept as the floor for anything a theme cannot supply. */
const DARK_NEUTRALS = {
  canvas: '#07090d',
  surface: '#161616',
  border: '#2a2a2a',
  text: '#e8e8e8',
  muted: '#888888',
}

const LIGHT_NEUTRALS = {
  canvas: '#f7f7f8',
  surface: '#ffffff',
  border: '#e4e4e7',
  text: '#18181b',
  muted: '#71717a',
}

/** Black or white, whichever reads on the brand colour; emails have no Mantine autoContrast. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1]!, 16)
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!
  return luminance > 0.5 ? '#111111' : '#ffffff'
}

/** Derive the email palette from the app's applied theme. */
export function emailThemeFromTheme(theme: Theme): Omit<EmailTheme, 'appName'> {
  const dark = theme.structure.defaultColorScheme === 'dark'
  const tuple = theme.structure.darkColors
  const neutrals = dark
    ? {
        canvas: tuple?.[7] ?? DARK_NEUTRALS.canvas,
        surface: tuple?.[6] ?? DARK_NEUTRALS.surface,
        border: tuple?.[4] ?? DARK_NEUTRALS.border,
        text: tuple?.[0] ?? DARK_NEUTRALS.text,
        muted: tuple?.[2] ?? DARK_NEUTRALS.muted,
      }
    : LIGHT_NEUTRALS
  const primary = theme.brand.colors.primary
  return {
    fonts: { body: theme.brand.fonts?.body ?? 'Inter, Arial, sans-serif' },
    colors: {
      ...neutrals,
      accent: theme.brand.colors.accent ?? primary,
      button: primary,
      buttonText: readableOn(primary),
    },
  }
}

/** Re-brands `emails/theme.json` from a theme, merging so `appName` and any project keys survive; false when there is no `emails/`. */
export function applyEmailTheme(repoDir: string, theme: Theme): boolean {
  const path = join(repoDir, 'emails', 'theme.json')
  if (!existsSync(path)) return false
  let current: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (parsed && typeof parsed === 'object') current = parsed as Record<string, unknown>
  } catch {
    // A theme.json the project broke is replaced rather than merged: the templates
    // interpolate these keys directly, so a half-parsed file renders emails with
    // literal `{{theme.colors.text}}` in them. The keys we write are the full set.
  }
  const derived = emailThemeFromTheme(theme)
  writeFileSync(path, `${JSON.stringify({ ...current, ...derived }, null, 2)}\n`, 'utf8')
  return true
}
