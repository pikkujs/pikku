import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { BadRequestError, NotFoundError } from '@pikku/core/errors'

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

export type JsxPropValue = string | number | boolean

export type ThemeSpecPatch = {
  colors?: Record<string, string>
  fonts?: { heading?: string; body?: string }
  defaultRadius?: string
  autoContrast?: boolean
  defaultColorScheme?: 'light' | 'dark' | 'auto'
  primaryShade?: { light: number; dark: number }
  shadows?: Record<string, string>
  defaultGradient?: { from: string; to: string; deg: number }
  components?: Record<string, { defaultProps: Record<string, JsxPropValue | null> }>
}

const THEME_ID_RE = /^[a-z][a-z0-9-]{0,38}$/
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
const DEFAULT_SCALE = ['xs', 'sm', 'md', 'lg', 'xl']

const writeJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf-8')

/** The project's `packages/mantine-theme` themes, and literal JSX props in its source. */
export class DesignService {
  private themePkgDir: string
  private themesDir: string

  constructor(private workspaceRoot: string) {
    this.themePkgDir = join(workspaceRoot, 'packages', 'mantine-theme')
    this.themesDir = join(this.themePkgDir, 'themes')
  }

  async listThemes(): Promise<{ themes: ThemeEntry[]; activeId: string; tokens: ThemeTokens }> {
    const themes: ThemeEntry[] = []
    for (const id of await this.themeIds()) {
      const spec = await this.readSpec(id).catch(() => undefined)
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

  async getThemeSpec(): Promise<{ id: string; spec: ThemeSpec; tokens: ThemeTokens }> {
    const id = await this.activeId()
    return { id, spec: await this.readSpec(id), tokens: await this.tokens() }
  }

  async setActiveTheme(id: string): Promise<string> {
    if (!existsSync(this.specPath(id))) throw new NotFoundError(`Unknown theme: ${id}`)
    await writeJson(join(this.themePkgDir, 'active.json'), { id })
    await this.writeIndex(id)
    return id
  }

  async createTheme(id: string, name: string): Promise<string> {
    if (existsSync(this.specPath(id))) throw new BadRequestError(`Theme ${id} already exists`)
    const base = await this.readSpec(await this.activeId())
    await writeJson(this.specPath(id), { ...base, name })
    return this.setActiveTheme(id)
  }

  async deleteTheme(id: string): Promise<string> {
    if (id === 'default') throw new BadRequestError('The default theme cannot be deleted')
    const path = this.specPath(id)
    if (!existsSync(path)) throw new NotFoundError(`Unknown theme: ${id}`)
    await rm(path)
    if ((await this.activeId()) === id) return this.setActiveTheme('default')
    const activeId = await this.activeId()
    await this.writeIndex(activeId)
    return activeId
  }

  async updateThemeSpec(patch: ThemeSpecPatch): Promise<void> {
    const id = await this.activeId()
    const spec = await this.readSpec(id)
    if (patch.colors) {
      for (const [key, hex] of Object.entries(patch.colors)) {
        if (!/^[a-z][a-zA-Z0-9]*$/.test(key) || !HEX_RE.test(hex)) {
          throw new BadRequestError(`Invalid colour ${key}: ${hex}`)
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
          throw new BadRequestError(`Invalid component: ${component}`)
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

  async readJsxProps(path: string, line: number, col: number): Promise<Record<string, JsxPropValue>> {
    const { readJsxProps } = await this.jsx()
    const props = readJsxProps(await this.readSource(path), line, col)
    if (!props) throw new NotFoundError(`No JSX element at ${path}:${line}:${col}`)
    return props
  }

  async writeJsxProp(
    path: string,
    line: number,
    col: number,
    name: string,
    value: JsxPropValue | null
  ): Promise<void> {
    const { writeJsxProp } = await this.jsx()
    const source = await this.readSource(path)
    const updated = writeJsxProp(source, line, col, name, value)
    if (updated !== source) await writeFile(this.sourcePath(path), updated, 'utf-8')
  }

  private async jsx(): Promise<typeof import('@pikku/code-edit')> {
    const codeEditPath = '@pikku/code-edit'
    return import(codeEditPath)
  }

  private sourcePath(path: string): string {
    const abs = resolve(this.workspaceRoot, path)
    if (!abs.startsWith(this.workspaceRoot + sep)) throw new BadRequestError('Path escapes the project')
    return abs
  }

  private async readSource(path: string): Promise<string> {
    const abs = this.sourcePath(path)
    const info = await stat(abs).catch(() => undefined)
    if (!info?.isFile()) throw new NotFoundError(`No file at ${path}`)
    if (info.size > 1_000_000) throw new BadRequestError('File too large')
    return readFile(abs, 'utf-8')
  }

  private specPath(id: string): string {
    if (!THEME_ID_RE.test(id)) throw new BadRequestError(`Invalid theme id: ${id}`)
    return join(this.themesDir, `${id}.json`)
  }

  private async readSpec(id: string): Promise<ThemeSpec> {
    try {
      return JSON.parse(await readFile(this.specPath(id), 'utf-8'))
    } catch {
      throw new NotFoundError(`Theme ${id} not found`)
    }
  }

  private async themeIds(): Promise<string[]> {
    const entries = await readdir(this.themesDir, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name.slice(0, -'.json'.length))
      .filter((id) => THEME_ID_RE.test(id))
      .sort()
  }

  private async activeId(): Promise<string> {
    try {
      const { id } = JSON.parse(await readFile(join(this.themePkgDir, 'active.json'), 'utf-8'))
      if (typeof id === 'string' && THEME_ID_RE.test(id)) return id
    } catch {}
    return 'default'
  }

  private async tokens(): Promise<ThemeTokens> {
    const base = await readFile(join(this.themePkgDir, 'base.json'), 'utf-8')
      .then((text) => JSON.parse(text) as Record<string, unknown>)
      .catch(() => ({}) as Record<string, unknown>)
    const keys = (field: string) => {
      const value = base[field]
      return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : DEFAULT_SCALE
    }
    return { spacing: keys('spacing'), radius: keys('radius'), fontSizes: keys('fontSizes') }
  }

  /** Rewrites the themes barrel stamped with the active id, so the running app reloads on a switch. */
  private async writeIndex(activeId: string): Promise<void> {
    const ids = await this.themeIds()
    const binding = (id: string) => `t_${id.replace(/-/g, '_')}`
    await writeFile(
      join(this.themesDir, 'index.ts'),
      [
        '// Generated by the pikku console — do not edit by hand.',
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
