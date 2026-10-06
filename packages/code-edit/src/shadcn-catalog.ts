import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseCva } from './cva.js'

export type ComponentMeta = {
  variantOptions: Record<string, string[]>
  defaultVariants: Record<string, string>
  file: string | null
  source: 'app' | 'none'
}

const pascal = (name: string) =>
  name
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')

/** The project's shadcn components, read from the app's `src/components/ui`. */
export class ShadcnCatalog {
  private app?: Promise<string | null>

  constructor(private workspaceRoot: string) {}

  /** The first of the workspace root, `apps/*` and `packages/*` that has `src/components/ui`. */
  uiApp(): Promise<string | null> {
    this.app ??= this.findUiApp()
    return this.app
  }

  async componentNames(): Promise<{ components: string[] }> {
    const dir = await this.uiApp()
    if (!dir) return { components: [] }
    const files = await readdir(join(dir, 'src/components/ui')).catch(() => [])
    return {
      components: files
        .filter((f) => f.endsWith('.tsx') && !f.includes('.stories.'))
        .map((f) => pascal(f.slice(0, -4)))
        .sort(),
    }
  }

  /** A component's variants, sizes and defaults, read from its `cva` definition. */
  async componentMeta(componentName: string): Promise<ComponentMeta> {
    const empty: ComponentMeta = {
      variantOptions: {},
      defaultVariants: {},
      file: null,
      source: 'none',
    }
    const dir = await this.uiApp()
    if (!dir) return empty
    const wanted = componentName.toLowerCase().replace(/[-_]/g, '')
    const files = await readdir(join(dir, 'src/components/ui')).catch(() => [])
    const file = files.find(
      (f) =>
        f.endsWith('.tsx') &&
        !f.includes('.stories.') &&
        f.slice(0, -4).replace(/[-_]/g, '') === wanted
    )
    if (!file) return empty
    const path = join(dir, 'src/components/ui', file)
    const cva = parseCva(await readFile(path, 'utf-8'))
    return {
      variantOptions: cva?.variants ?? {},
      defaultVariants: cva?.defaultVariants ?? {},
      file: path,
      source: 'app',
    }
  }

  /** The names (kebab-case) of the components in the app's `src/components/ui`. */
  async installedComponentFiles(): Promise<Set<string>> {
    const dir = await this.uiApp()
    const files = dir
      ? await readdir(join(dir, 'src/components/ui')).catch(() => [])
      : []
    return new Set(
      files
        .filter((f) => f.endsWith('.tsx') && !f.includes('.stories.'))
        .map((f) => f.slice(0, -4))
    )
  }

  private async findUiApp(): Promise<string | null> {
    const dirs = [this.workspaceRoot]
    for (const sub of ['apps', 'packages']) {
      const entries = await readdir(join(this.workspaceRoot, sub), {
        withFileTypes: true,
      }).catch(() => [])
      for (const e of entries)
        if (e.isDirectory()) dirs.push(join(this.workspaceRoot, sub, e.name))
    }
    for (const dir of dirs) {
      const entries = await readdir(join(dir, 'src/components/ui')).catch(
        () => null
      )
      if (entries?.some((f) => f.endsWith('.tsx'))) return dir
    }
    return null
  }
}
