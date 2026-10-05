import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as RegistryModule from '@pikku/shadcdn'

export type { Block, ResolvedBlock } from '@pikku/shadcdn'

export class ComponentsNotInstalledError extends Error {}

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

const UPSTREAM = 'https://ui.shadcn.com/r/styles/new-york-v4'

const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** One component from the upstream shadcn registry, with its imports rewritten to the app's layout. */
async function fetchUpstream(name: string): Promise<{
  name: string
  files: Array<{ name: string; content: string }>
  dependencies: string[]
  registryDependencies: string[]
} | null> {
  const response = await fetch(`${UPSTREAM}/${kebab(name)}.json`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`The shadcn registry answered ${response.status} for ${name}`)
  const item = (await response.json()) as {
    name: string
    dependencies?: string[]
    registryDependencies?: string[]
    files: Array<{ path: string; content: string }>
  }
  const files = item.files.map((file) => ({
    name: file.path.split('/').pop()!,
    content: file.content
      .replace(/from "cn"/g, "from '@/lib/utils'")
      .replace(/from "@\/registry\/[^/"]+\/ui\/([^"]+)"/g, "from './$1'"),
  }))
  const imported = files.some((f) => f.content.includes('lucide-react')) ? ['lucide-react'] : []
  return {
    name: item.name,
    files,
    dependencies: [...(item.dependencies ?? []).filter((d) => d !== 'cn').map((d) => d.replace(/@latest$/, '')), ...imported],
    registryDependencies: (item.registryDependencies ?? []).filter((d) => !d.includes('/')),
  }
}

/** The project's shadcn components, read from the app's `src/components/ui`, and the block library from `@pikku/shadcdn`. */
export class ShadcnCatalog {
  private app?: Promise<string | null>
  private registry?: Promise<typeof RegistryModule>

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
    const empty: ComponentMeta = { variantOptions: {}, defaultVariants: {}, file: null, source: 'none' }
    const dir = await this.uiApp()
    if (!dir) return empty
    const wanted = componentName.toLowerCase().replace(/[-_]/g, '')
    const files = await readdir(join(dir, 'src/components/ui')).catch(() => [])
    const file = files.find((f) => f.endsWith('.tsx') && !f.includes('.stories.') && f.slice(0, -4).replace(/[-_]/g, '') === wanted)
    if (!file) return empty
    const path = join(dir, 'src/components/ui', file)
    const { parseCva } = await this.components()
    const cva = parseCva(await readFile(path, 'utf-8'))
    return { variantOptions: cva?.variants ?? {}, defaultVariants: cva?.defaultVariants ?? {}, file: path, source: 'app' }
  }

  /**
   * Copy components into the app's `src/components/ui`, looking in the app first (a file
   * that exists is never overwritten), then in pikku's set (`@pikku/shadcdn`, with its
   * i18n-gated text props), then in the upstream shadcn registry. Upstream components
   * come back in `ungated`: their text props take plain strings, so gate them by hand.
   * Stories ride along only when the app has `csf.types.ts` for them to import.
   */
  async installComponents(names: string[]): Promise<{
    installed: string[]
    wrote: string[]
    skipped: string[]
    npmDeps: string[]
    unknown: string[]
    ungated: string[]
  }> {
    const dir = await this.uiApp()
    if (!dir) {
      throw new Error("No src/components/ui in this workspace; scaffold the app first")
    }
    const registry = await this.components()
    const hasCsf = existsSync(join(dir, 'src/components/ui/csf.types.ts'))
    const result = { installed: [] as string[], wrote: [] as string[], skipped: [] as string[], npmDeps: [] as string[], unknown: [] as string[], ungated: [] as string[] }
    const deps = new Set<string>()
    const write = async (file: string, content: string) => {
      const path = join(dir, 'src', file)
      if (existsSync(path)) {
        result.skipped.push(path)
        return
      }
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content, 'utf-8')
      result.wrote.push(path)
    }
    const seen = new Set<string>()
    const install = async (name: string, top: boolean): Promise<void> => {
      if (seen.has(name.toLowerCase())) return
      seen.add(name.toLowerCase())
      const own = join(dir, 'src/components/ui', `${kebab(name)}.tsx`)
      if (existsSync(own)) {
        if (top) result.skipped.push(own)
        return
      }
      const resolved = registry.resolveComponent(name)
      if (resolved) {
        if (top) result.installed.push(resolved.component.name)
        resolved.npmDeps.forEach((d) => deps.add(d))
        for (const [file, content] of Object.entries(resolved.files)) {
          if (file.endsWith('.stories.tsx') && !hasCsf) continue
          await write(file, content)
        }
        return
      }
      const upstream = await fetchUpstream(name)
      if (!upstream) {
        result.unknown.push(name)
        return
      }
      if (top) result.installed.push(upstream.name)
      result.ungated.push(upstream.name)
      upstream.dependencies.forEach((d) => deps.add(d))
      for (const file of upstream.files) await write(`components/ui/${file.name}`, file.content)
      for (const dep of upstream.registryDependencies) await install(dep, false)
    }
    for (const name of names) await install(name, true)
    result.npmDeps = [...deps].sort()
    return result
  }

  /** Merge message keys into the app's default-locale catalogue (`messages/en.json`), never overwriting a key that exists. */
  async addMessages(keys: Record<string, string>): Promise<{ file: string | null; added: string[] }> {
    const dir = await this.uiApp()
    const file = dir ? join(dir, 'messages/en.json') : null
    if (!file || !existsSync(file)) return { file: null, added: [] }
    const catalogue = JSON.parse(await readFile(file, 'utf-8')) as Record<string, string>
    const added: string[] = []
    for (const [key, text] of Object.entries(keys)) {
      if (key in catalogue) continue
      catalogue[key] = text
      added.push(key)
    }
    if (added.length) await writeFile(file, JSON.stringify(catalogue, null, 2) + '\n', 'utf-8')
    return { file, added }
  }

  /** The names (kebab-case) of the components in the app's `src/components/ui`. */
  async installedComponentFiles(): Promise<Set<string>> {
    const dir = await this.uiApp()
    const files = dir ? await readdir(join(dir, 'src/components/ui')).catch(() => []) : []
    return new Set(files.filter((f) => f.endsWith('.tsx') && !f.includes('.stories.')).map((f) => f.slice(0, -4)))
  }

  blocks(): Promise<typeof RegistryModule> {
    return this.components()
  }

  private components(): Promise<typeof RegistryModule> {
    this.registry ??= this.importRegistry()
    return this.registry
  }

  private async findUiApp(): Promise<string | null> {
    const dirs = [this.workspaceRoot]
    for (const sub of ['apps', 'packages']) {
      const entries = await readdir(join(this.workspaceRoot, sub), { withFileTypes: true }).catch(() => [])
      for (const e of entries) if (e.isDirectory()) dirs.push(join(this.workspaceRoot, sub, e.name))
    }
    for (const dir of dirs) {
      const entries = await readdir(join(dir, 'src/components/ui')).catch(() => null)
      if (entries?.some((f) => f.endsWith('.tsx'))) return dir
    }
    return null
  }

  private async importRegistry(): Promise<typeof RegistryModule> {
    const specifier = '@pikku/shadcdn'
    for (const dir of [await this.uiApp(), this.workspaceRoot]) {
      if (!dir) continue
      try {
        const resolved = createRequire(join(dir, 'package.json')).resolve(specifier)
        return (await import(pathToFileURL(resolved).href)) as typeof RegistryModule
      } catch {}
    }
    try {
      return (await import(specifier)) as typeof RegistryModule
    } catch {
      throw new ComponentsNotInstalledError(`${specifier} is not installed in this project; add it as a dev dependency`)
    }
  }
}
