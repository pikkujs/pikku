import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { BadRequestError, NotFoundError } from '@pikku/core/errors'
import {
  LISTED_PRESETS,
  BRANDS,
  STRUCTURES,
  ThemeError,
  ThemeWorkspace,
  type ThemeInput,
  type ThemeSpecPatch,
} from '@pikku/code-edit/theme'
import type * as CodeEdit from '@pikku/code-edit'
import { ShadcnCatalog } from '@pikku/code-edit/shadcn'
import type { ComponentMeta } from '@pikku/code-edit/shadcn'

export type {
  ThemeEntry,
  ThemeSpec,
  ThemeSpecPatch,
  ThemeTokens,
  ThemeInput,
} from '@pikku/code-edit/theme'

export type { ComponentMeta } from '@pikku/code-edit/shadcn'

export type JsxPropValue = string | number | boolean

export type ThemePreset = {
  id: string
  name: string
  description: string
  colors: { primary: string; secondary?: string; accent?: string }
  scheme: 'light' | 'dark' | 'auto'
}

const toPikkuError = (error: unknown): never => {
  if (error instanceof ThemeError) {
    throw error.kind === 'missing'
      ? new NotFoundError(error.message)
      : new BadRequestError(error.message)
  }
  if (error instanceof Error && error.message.startsWith('No '))
    throw new BadRequestError(error.message)
  throw error
}

/** The project's theme package and literal JSX props in its source, for the console's Design page. */
export class DesignService {
  private themes: ThemeWorkspace
  private shadcn: ShadcnCatalog

  constructor(private workspaceRoot: string) {
    this.themes = new ThemeWorkspace(workspaceRoot)
    this.shadcn = new ShadcnCatalog(workspaceRoot)
  }

  componentMeta(componentName: string): Promise<ComponentMeta> {
    return this.shadcn.componentMeta(componentName).catch(toPikkuError)
  }

  uiComponents(): Promise<{ components: string[] }> {
    return this.shadcn.componentNames().catch(toPikkuError)
  }

  listThemes() {
    return this.themes.list().catch(toPikkuError)
  }

  getThemeSpec() {
    return this.themes.active().catch(toPikkuError)
  }

  setActiveTheme(id: string) {
    return this.themes.setActive(id).catch(toPikkuError)
  }

  createTheme(id: string, name: string) {
    return this.themes.create(id, name).catch(toPikkuError)
  }

  deleteTheme(id: string) {
    return this.themes.delete(id).catch(toPikkuError)
  }

  updateThemeSpec(patch: ThemeSpecPatch) {
    return this.themes.update(patch).catch(toPikkuError)
  }

  async applyTheme(
    input: ThemeInput
  ): Promise<{ activeId: string; emails: boolean }> {
    const { id, emails } = await this.themes.apply(input).catch(toPikkuError)
    return { activeId: id, emails }
  }

  presets(): ThemePreset[] {
    return LISTED_PRESETS.map((preset) => {
      const brand = BRANDS[preset.brandId]!
      return {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        colors: brand.colors,
        scheme: STRUCTURES[preset.structureId]?.defaultColorScheme ?? 'auto',
      }
    })
  }

  async readJsxProps(
    path: string,
    line: number,
    col: number
  ): Promise<Record<string, JsxPropValue>> {
    const { readJsxProps } = await this.jsx()
    const props = readJsxProps(await this.readSource(path), line, col)
    if (!props)
      throw new NotFoundError(`No JSX element at ${path}:${line}:${col}`)
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
    if (updated !== source)
      await writeFile(this.sourcePath(path), updated, 'utf-8')
  }

  private async jsx(): Promise<typeof CodeEdit> {
    const codeEditPath = '@pikku/code-edit'
    return import(codeEditPath)
  }

  private sourcePath(path: string): string {
    const abs = resolve(this.workspaceRoot, path)
    if (!abs.startsWith(this.workspaceRoot + sep))
      throw new BadRequestError('Path escapes the project')
    return abs
  }

  private async readSource(path: string): Promise<string> {
    const abs = this.sourcePath(path)
    const info = await stat(abs).catch(() => undefined)
    if (!info?.isFile()) throw new NotFoundError(`No file at ${path}`)
    if (info.size > 1_000_000) throw new BadRequestError('File too large')
    return readFile(abs, 'utf-8')
  }
}
