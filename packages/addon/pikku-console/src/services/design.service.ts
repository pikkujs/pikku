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
import { MantineCatalog, MantineNotInstalledError } from '@pikku/code-edit/mantine'
import type { ComponentMeta, MantineBlock, ResolvedMantineBlock } from '@pikku/code-edit/mantine'

export type {
  ThemeEntry,
  ThemeSpec,
  ThemeSpecPatch,
  ThemeTokens,
  ThemeInput,
} from '@pikku/code-edit/theme'

export type { ComponentMeta, MantineManifestProp } from '@pikku/code-edit/mantine'

export type JsxPropValue = string | number | boolean

export type BlockSummary = Pick<MantineBlock, 'name' | 'title' | 'description' | 'tags'>

export type BlockDetail = BlockSummary &
  Pick<MantineBlock, 'usage'> &
  Pick<ResolvedMantineBlock, 'composes' | 'files' | 'i18nKeys' | 'npmDeps'>

export type ThemePreset = {
  id: string
  name: string
  description: string
  colors: { primary: string; secondary?: string; accent?: string }
  scheme: 'light' | 'dark' | 'auto'
}

const toPikkuError = (error: unknown): never => {
  if (error instanceof ThemeError) {
    throw error.kind === 'missing' ? new NotFoundError(error.message) : new BadRequestError(error.message)
  }
  if (error instanceof Error && error.message.startsWith('No ')) throw new BadRequestError(error.message)
  if (error instanceof MantineNotInstalledError) throw new NotFoundError(error.message)
  throw error
}

/** The project's theme package and literal JSX props in its source, for the console's Design page. */
export class DesignService {
  private themes: ThemeWorkspace
  private mantine: MantineCatalog

  constructor(private workspaceRoot: string) {
    this.themes = new ThemeWorkspace(workspaceRoot)
    this.mantine = new MantineCatalog(workspaceRoot)
  }

  componentMeta(componentName: string): Promise<ComponentMeta> {
    return this.mantine.componentMeta(componentName).catch(toPikkuError)
  }

  mantineComponents(): Promise<{ mantineVersion: string | null; components: string[] }> {
    return this.mantine.componentNames().catch(toPikkuError)
  }

  async listBlocks(tag?: string): Promise<{ tags: Array<{ tag: string; count: number }>; blocks: BlockSummary[] }> {
    const { blockTags, listBlocks } = await this.mantine.blocks().catch(toPikkuError)
    return {
      tags: blockTags(),
      blocks: listBlocks(tag).map(({ name, title, description, tags }) => ({ name, title, description, tags })),
    }
  }

  async getBlock(name: string): Promise<BlockDetail> {
    const { resolveBlock } = await this.mantine.blocks().catch(toPikkuError)
    const resolved = resolveBlock(name)
    if (!resolved) throw new NotFoundError(`No block named ${name}`)
    const { block, composes, files, i18nKeys, npmDeps } = resolved
    return {
      name: block.name,
      title: block.title,
      description: block.description,
      tags: block.tags,
      usage: block.usage,
      composes,
      files,
      i18nKeys,
      npmDeps,
    }
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

  async applyTheme(input: ThemeInput): Promise<{ activeId: string; emails: boolean }> {
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
}
