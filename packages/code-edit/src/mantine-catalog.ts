import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as ComponentMetaModule from '@pikku/mantine/component-meta'
import type * as BlocksModule from '@pikku/mantine/blocks'
import type { ComponentMeta } from '@pikku/mantine/component-meta'
import { ThemeWorkspace } from './theme/theme-workspace.js'

export type {
  ComponentMeta,
  MantineManifestProp,
} from '@pikku/mantine/component-meta'
export type { MantineBlock, ResolvedMantineBlock } from '@pikku/mantine/blocks'

export class MantineNotInstalledError extends Error {}

type MantineApp = { dir: string; mantineVersion: string }

const readVersion = async (pkgJson: string): Promise<string | undefined> => {
  try {
    return JSON.parse(await readFile(pkgJson, 'utf-8')).version
  } catch {
    return undefined
  }
}

/** The project's Mantine component metadata and block library, read through the `@pikku/mantine` it installs. */
export class MantineCatalog {
  private app?: Promise<MantineApp | null>
  private modules = new Map<string, Promise<unknown>>()

  constructor(private workspaceRoot: string) {}

  /** The first of the workspace root, `apps/*` and `packages/*` that installs `@mantine/core`. */
  mantineApp(): Promise<MantineApp | null> {
    this.app ??= this.findMantineApp()
    return this.app
  }

  async componentNames(): Promise<{
    mantineVersion: string | null
    components: string[]
  }> {
    const app = await this.mantineApp()
    const { mantineComponentNames, mantineManifest } =
      await this.componentMetaModule()
    return {
      mantineVersion:
        mantineManifest(app?.mantineVersion)?.mantineVersion ?? null,
      components: mantineComponentNames(app?.mantineVersion),
    }
  }

  /** A component's props, variants and sizes for the installed Mantine major, with the active theme's custom variants. */
  async componentMeta(componentName: string): Promise<ComponentMeta> {
    const app = await this.mantineApp()
    const empty: ComponentMeta = {
      props: [],
      variantOptions: [],
      sizeOptions: [],
      source: 'none',
    }
    if (!app) return empty
    const { componentMeta } = await this.componentMetaModule()
    return componentMeta(
      componentName,
      app.mantineVersion,
      await this.customVariants(componentName)
    )
  }

  async blocks(): Promise<typeof BlocksModule> {
    return this.load<typeof BlocksModule>('blocks')
  }

  private componentMetaModule(): Promise<typeof ComponentMetaModule> {
    return this.load<typeof ComponentMetaModule>('component-meta')
  }

  private async customVariants(componentName: string): Promise<string[]> {
    try {
      const { spec } = await new ThemeWorkspace(this.workspaceRoot).active()
      const components = spec.structure?.components as
        Record<string, { variants?: object }> | undefined
      const variants = components?.[componentName]?.variants
      return variants && typeof variants === 'object'
        ? Object.keys(variants)
        : []
    } catch {
      return []
    }
  }

  private async findMantineApp(): Promise<MantineApp | null> {
    const dirs = [this.workspaceRoot]
    for (const sub of ['apps', 'packages']) {
      const entries = await readdir(join(this.workspaceRoot, sub), {
        withFileTypes: true,
      }).catch(() => [])
      for (const e of entries)
        if (e.isDirectory()) dirs.push(join(this.workspaceRoot, sub, e.name))
    }
    for (const dir of dirs) {
      const mantineVersion = await readVersion(
        join(dir, 'node_modules/@mantine/core/package.json')
      )
      if (mantineVersion) return { dir, mantineVersion }
    }
    return null
  }

  private load<T>(subpath: string): Promise<T> {
    let mod = this.modules.get(subpath)
    if (!mod) {
      mod = this.importMantine(subpath)
      this.modules.set(subpath, mod)
    }
    return mod as Promise<T>
  }

  private async importMantine(subpath: string): Promise<unknown> {
    const specifier = `@pikku/mantine/${subpath}`
    const app = await this.mantineApp()
    for (const dir of [app?.dir, this.workspaceRoot]) {
      if (!dir) continue
      try {
        const resolved = createRequire(join(dir, 'package.json')).resolve(
          specifier
        )
        return interop(await import(pathToFileURL(resolved).href))
      } catch {}
    }
    try {
      return interop(await import(specifier))
    } catch {
      throw new MantineNotInstalledError(
        `${specifier} is not installed in this project; add @pikku/mantine to the app`
      )
    }
  }
}

const interop = (mod: Record<string, unknown>): unknown =>
  mod.default &&
  typeof mod.default === 'object' &&
  !('MANTINE_META' in mod || 'MANTINE_BLOCKS' in mod)
    ? mod.default
    : mod
