import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { composeTheme, type ThemeInput } from './compose.js'
import { applyEmailTheme } from './email-theme.js'
import { THEME_ID_RE, type Theme } from './presets.js'

export type ThemeEntry = {
  id: string
  name: string
  description?: string
  bases?: Record<string, string>
}

export type ThemeTokens = { spacing: string[]; radius: string[]; fontSizes: string[] }

export type ThemeSpec = {
  name?: string
  brand?: { colors?: Record<string, string>; fonts?: Record<string, string> }
  structure?: Record<string, unknown>
} & Record<string, unknown>

export type ThemeSpecPatch = {
  colors?: Record<string, string>
  fonts?: { heading?: string; body?: string }
  defaultRadius?: string
  autoContrast?: boolean
  defaultColorScheme?: 'light' | 'dark' | 'auto'
  primaryShade?: { light: number; dark: number }
  shadows?: Record<string, string>
  defaultGradient?: { from: string; to: string; deg: number }
  components?: Record<string, { defaultProps: Record<string, string | number | boolean | null> }>
}

export class ThemeError extends Error {
  constructor(
    message: string,
    public readonly kind: 'invalid' | 'missing'
  ) {
    super(message)
  }
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
const DEFAULT_SCALE = ['xs', 'sm', 'md', 'lg', 'xl']
export const THEME_PACKAGE_DIR = join('packages', 'mantine-theme')

const writeJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf-8')

/** The project's theme package: `themes/<id>.json`, `active.json`, optional `base.json`, and the generated `themes/index.ts`. */
export class ThemeWorkspace {
  readonly packageDir: string
  private themesDir: string

  constructor(private workspaceRoot: string, packageDir = THEME_PACKAGE_DIR) {
    this.packageDir = join(workspaceRoot, packageDir)
    this.themesDir = join(this.packageDir, 'themes')
  }

  async list(): Promise<{ themes: ThemeEntry[]; activeId: string; tokens: ThemeTokens }> {
    const themes: ThemeEntry[] = []
    for (const id of await this.ids()) {
      const spec = await this.read(id).catch(() => undefined)
      if (!spec) continue
      const colors = spec.brand?.colors
      themes.push({
        id,
        name: typeof spec.name === 'string' && spec.name ? spec.name : id,
        ...(typeof spec.description === 'string' ? { description: spec.description } : {}),
        ...(colors && typeof colors === 'object' ? { bases: colors } : {}),
      })
    }
    return { themes, activeId: await this.activeId(), tokens: await this.tokens() }
  }

  async active(): Promise<{ id: string; spec: ThemeSpec; tokens: ThemeTokens }> {
    const id = await this.activeId()
    return { id, spec: await this.read(id), tokens: await this.tokens() }
  }

  async setActive(id: string): Promise<string> {
    if (!existsSync(this.specPath(id))) throw new ThemeError(`Unknown theme: ${id}`, 'missing')
    await writeJson(join(this.packageDir, 'active.json'), { id })
    await this.writeIndex(id)
    return id
  }

  async create(id: string, name: string): Promise<string> {
    if (existsSync(this.specPath(id))) throw new ThemeError(`Theme ${id} already exists`, 'invalid')
    const base = await this.read(await this.activeId())
    await writeJson(this.specPath(id), { ...base, name })
    return this.setActive(id)
  }

  async delete(id: string): Promise<string> {
    if (id === 'default') throw new ThemeError('The default theme cannot be deleted', 'invalid')
    const path = this.specPath(id)
    if (!existsSync(path)) throw new ThemeError(`Unknown theme: ${id}`, 'missing')
    await rm(path)
    const activeId = (await this.activeId()) === id ? 'default' : await this.activeId()
    return this.setActive(activeId)
  }

  /** Writes a composed theme under its id, makes it active, and re-brands the project's emails. */
  async apply(input: ThemeInput): Promise<{ id: string; theme: Theme; emails: boolean }> {
    const { id, theme } = composeTheme(input)
    await mkdir(this.themesDir, { recursive: true })
    await writeJson(this.specPath(id), theme)
    await this.setActive(id)
    return { id, theme, emails: applyEmailTheme(this.workspaceRoot, theme) }
  }

  async update(patch: ThemeSpecPatch): Promise<void> {
    const id = await this.activeId()
    const spec = await this.read(id)
    if (patch.colors) {
      for (const [key, hex] of Object.entries(patch.colors)) {
        if (!/^[a-z][a-zA-Z0-9]*$/.test(key) || !HEX_RE.test(hex)) {
          throw new ThemeError(`Invalid colour ${key}: ${hex}`, 'invalid')
        }
      }
      spec.brand = { ...spec.brand, colors: { ...spec.brand?.colors, ...patch.colors } }
    }
    if (patch.fonts) {
      spec.brand = { ...spec.brand, fonts: { ...spec.brand?.fonts, ...patch.fonts } }
    }
    const { colors: _c, fonts: _f, shadows, components, ...scalars } = patch
    const structure: Record<string, unknown> = { ...spec.structure }
    for (const [key, value] of Object.entries(scalars)) {
      if (value !== undefined) structure[key] = value
    }
    if (shadows) {
      structure.shadows = { ...(structure.shadows as Record<string, string>), ...shadows }
    }
    if (components) {
      const merged = { ...(structure.components as Record<string, Record<string, unknown>>) }
      for (const [component, { defaultProps: changes }] of Object.entries(components)) {
        if (!/^[A-Z][A-Za-z0-9]{0,63}$/.test(component)) {
          throw new ThemeError(`Invalid component: ${component}`, 'invalid')
        }
        const { defaultProps, ...rest } = merged[component] ?? {}
        const props = { ...(defaultProps as Record<string, unknown>) }
        for (const [prop, value] of Object.entries(changes)) {
          if (value === null) delete props[prop]
          else props[prop] = value
        }
        if (Object.keys(props).length) merged[component] = { ...rest, defaultProps: props }
        else if (Object.keys(rest).length) merged[component] = rest
        else delete merged[component]
      }
      structure.components = merged
    }
    spec.structure = structure
    await writeJson(this.specPath(id), spec)
  }

  private specPath(id: string): string {
    if (!THEME_ID_RE.test(id)) throw new ThemeError(`Invalid theme id: ${id}`, 'invalid')
    return join(this.themesDir, `${id}.json`)
  }

  private async read(id: string): Promise<ThemeSpec> {
    try {
      return JSON.parse(await readFile(this.specPath(id), 'utf-8'))
    } catch {
      throw new ThemeError(`Theme ${id} not found`, 'missing')
    }
  }

  private async ids(): Promise<string[]> {
    const entries = await readdir(this.themesDir, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name.slice(0, -'.json'.length))
      .filter((id) => THEME_ID_RE.test(id))
      .sort()
  }

  private async activeId(): Promise<string> {
    try {
      const { id } = JSON.parse(await readFile(join(this.packageDir, 'active.json'), 'utf-8'))
      if (typeof id === 'string' && THEME_ID_RE.test(id)) return id
    } catch {}
    return 'default'
  }

  private async tokens(): Promise<ThemeTokens> {
    const base = await readFile(join(this.packageDir, 'base.json'), 'utf-8')
      .then((text) => JSON.parse(text) as Record<string, unknown>)
      .catch(() => ({}) as Record<string, unknown>)
    const keys = (field: string) => {
      const value = base[field]
      return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : DEFAULT_SCALE
    }
    return { spacing: keys('spacing'), radius: keys('radius'), fontSizes: keys('fontSizes') }
  }

  /** Stamped with the active id so the running app reloads on a switch; active.json alone is watched unreliably. */
  private async writeIndex(activeId: string): Promise<void> {
    const ids = await this.ids()
    const binding = (id: string) => `t_${id.replace(/-/g, '_')}`
    await writeFile(
      join(this.themesDir, 'index.ts'),
      [
        '// Generated by pikku — do not edit by hand.',
        `// Active theme: ${activeId}`,
        ...ids.map((id) => `import ${binding(id)} from './${id}.json'`),
        '',
        'export const themeSpecs: Record<string, unknown> = {',
        ...ids.map((id) => `  '${id}': ${binding(id)},`),
        '}',
        '',
      ].join('\n'),
      'utf-8'
    )
  }
}
