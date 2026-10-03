/**
 * A palette is the editable contract for the Design tab and the theme chat tool.
 * It mirrors the `Palette` shape in `@project/mantine-themes` and the orchestrator's
 * `getSandboxThemes` / `setActiveTheme` RPCs: a name plus an optional primaryColor
 * and per-role base hexes. The theme package expands each base hex into a full
 * 10-shade Mantine scale, so a palette only declares one colour per role.
 */
export type Palette = {
  name: string
  description?: string
  primaryColor?: string
  bases?: Record<string, string>
}

export type ThemeEntry = { id: string } & Palette

export type ThemeTokens = { spacing: string[]; radius: string[]; fontSizes: string[] }

export type ThemesResponse = { themes: ThemeEntry[]; activeId: string; tokens?: ThemeTokens }

/**
 * A full theme SPEC (themes/<id>.json in the app's mantine-theme package) — the
 * file the app runtime actually builds its Mantine theme from, and the payload
 * the app root's `set-theme` listener knows how to apply live. Distinct from
 * `Palette`, which only feeds the Design tab's theme browser.
 */
export type ThemeComponentOverride = {
  defaultProps?: Record<string, string | number | boolean>
} & Record<string, unknown>

export type ThemeSpecStructure = {
  defaultRadius?: string
  autoContrast?: boolean
  defaultColorScheme?: 'light' | 'dark' | 'auto'
  primaryShade?: number | { light?: number; dark?: number }
  shadows?: Record<string, string>
  defaultGradient?: { from?: string; to?: string; deg?: number }
  components?: Record<string, ThemeComponentOverride | undefined>
} & Record<string, unknown>

export type ThemeSpec = {
  name?: string
  description?: string
  brand?: { colors?: Record<string, string>; fonts?: { heading?: string; body?: string } }
  structure?: ThemeSpecStructure
}

/** Patch accepted by the `updateSandboxThemeSpec` control RPC. */
export type ThemeSpecPatch = {
  colors?: Record<string, string>
  fonts?: { heading?: string; body?: string }
  defaultRadius?: string
  autoContrast?: boolean
  defaultColorScheme?: 'light' | 'dark' | 'auto'
  primaryShade?: { light: number; dark: number }
  shadows?: Record<string, string>
  defaultGradient?: { from: string; to: string; deg: number }
  // Per-component theme defaults; a null prop value deletes that override.
  components?: Record<string, { defaultProps: Record<string, string | number | boolean | null> }>
}

/** Client-side mirror of the server's spec merge, for optimistic live apply. */
export function applyThemeSpecPatch(spec: ThemeSpec, patch: ThemeSpecPatch): ThemeSpec {
  const next: ThemeSpec = { ...spec }
  if (patch.colors) {
    next.brand = { ...next.brand, colors: { ...next.brand?.colors, ...patch.colors } }
  }
  if (patch.fonts) {
    next.brand = { ...next.brand, fonts: { ...next.brand?.fonts, ...patch.fonts } }
  }
  const structure: ThemeSpecStructure = {}
  if (patch.defaultRadius !== undefined) structure.defaultRadius = patch.defaultRadius
  if (patch.autoContrast !== undefined) structure.autoContrast = patch.autoContrast
  if (patch.defaultColorScheme !== undefined)
    structure.defaultColorScheme = patch.defaultColorScheme
  if (patch.primaryShade !== undefined) structure.primaryShade = patch.primaryShade
  if (patch.defaultGradient !== undefined) structure.defaultGradient = patch.defaultGradient
  if (patch.shadows) structure.shadows = { ...next.structure?.shadows, ...patch.shadows }
  if (patch.components) {
    const components: Record<string, ThemeComponentOverride | undefined> = {
      ...next.structure?.components,
    }
    for (const [componentName, componentPatch] of Object.entries(patch.components)) {
      const existing = components[componentName] ?? {}
      const defaultProps = { ...existing.defaultProps }
      for (const [propName, propValue] of Object.entries(componentPatch.defaultProps)) {
        if (propValue === null) delete defaultProps[propName]
        else defaultProps[propName] = propValue
      }
      const { defaultProps: _dropped, ...siblings } = existing
      if (Object.keys(defaultProps).length) {
        components[componentName] = { ...siblings, defaultProps }
      } else if (Object.keys(siblings).length) {
        components[componentName] = siblings
      } else {
        delete components[componentName]
      }
    }
    structure.components = components
  }
  if (Object.keys(structure).length) next.structure = { ...next.structure, ...structure }
  return next
}

/** The active spec's editable surface, from the `getSandboxThemeSpec` control RPC. */
export type ThemeSpecResponse = {
  id: string
  name?: string
  colors: Record<string, string>
  defaultRadius?: string
  spec?: ThemeSpec
  tokens?: ThemeTokens
}

/** Rich per-prop metadata from the `getComponentMeta` control RPC (manifest-backed). */
export type ComponentPropMeta = {
  name: string
  kind:
    | 'select'
    | 'boolean'
    | 'number'
    | 'color'
    | 'token'
    | 'text'
    | 'node'
    | 'function'
    | 'object'
  options?: string[]
  freeText?: boolean
  tokenScale?: 'spacing' | 'radius' | 'fontSizes' | 'shadows' | 'size'
  default?: string
  description?: string
}

/** The Design lenses, discovered from the user's code. The active lens is the iframe `?view=`. */
export type DesignLens = 'library' | 'app'

export type ArgType = {
  description?: string
  control?: string | false
  defaultValue?: unknown
}

/** A query/mutation input declared by an App widget's `*.app.stories.tsx` meta. */
export type AppInput = {
  name: string
  kind: 'query' | 'mutation'
  type?: string
  description?: string
}

// ─── Catalog (pushed from the design server via the `catalog` postMessage) ──────
// The console's left menu is built from this — no RPC round-trip. Library/App are
// glob-discovered component/widget titles.

export type CatalogEntry = {
  /** Unique across the project's apps (`<app>/<title>`). Absent from a sandbox
   *  still on an image that keyed its catalog by title alone. */
  key?: string
  title: string
  group: string
  tags: string[]
}

export type DesignCatalog = {
  library: CatalogEntry[]
  app: CatalogEntry[]
}

/** The selected preview's metadata, pushed via `component-meta` to drive the
 *  right-column Props inspector. */
export type ComponentMeta = {
  title: string
  tags?: string[]
  argTypes?: Record<string, ArgType>
  inputs?: AppInput[]
}

/** Mantine's built-in palette names, offered as primaryColor options. */
export const MANTINE_DEFAULT_COLORS = [
  'dark',
  'gray',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
] as const
