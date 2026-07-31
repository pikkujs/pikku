import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileFunction } from 'node:vm'
import type { transformSync as EsbuildTransformSync } from 'esbuild'

type EsbuildTransform = typeof EsbuildTransformSync

let transformSync: EsbuildTransform | undefined

const loadTransform = async (): Promise<EsbuildTransform> => {
  if (transformSync) return transformSync
  // esbuild is a dev-only dependency hoisted from @pikku/cli at runtime; the
  // `./dev` export is dev-only so it is never loaded in production runtimes.
  const esbuild = await import('esbuild')
  transformSync = esbuild.transformSync
  return transformSync
}

export interface PikkuModuleRunner {
  /** Run a user module by absolute path. Repeated runs of one path overwrite a
   *  single registry slot. Returns `null` on failure so the caller can keep the
   *  previously-loaded code. */
  run: (absPath: string) => Promise<Record<string, unknown> | null>
  evict: (absPath: string) => void
  clear: () => void
  readonly size: number
}

export const createModuleRunner = (): PikkuModuleRunner => {
  const registry = new Map<string, Record<string, unknown>>()

  const run = async (
    filePath: string
  ): Promise<Record<string, unknown> | null> => {
    const absPath = resolve(filePath)
    try {
      const transform = await loadTransform()
      const source = await readFile(absPath, 'utf-8')
      const { code } = transform(source, {
        loader: absPath.endsWith('.ts') ? 'ts' : 'js',
        format: 'cjs',
        sourcefile: absPath,
      })

      const fn = compileFunction(
        code,
        ['require', 'exports', 'module', '__filename', '__dirname'],
        { filename: absPath }
      )

      const require = createRequire(pathToFileURL(absPath))
      const moduleObj: { exports: Record<string, unknown> } = { exports: {} }
      fn(require, moduleObj.exports, moduleObj, absPath, dirname(absPath))

      registry.set(absPath, moduleObj.exports)
      return moduleObj.exports
    } catch {
      // A bad edit, or the one known limitation: a file using top-level
      // `await`, which cannot be emitted in `cjs` form.
      return null
    }
  }

  return {
    run,
    evict: (filePath: string) => {
      registry.delete(resolve(filePath))
    },
    clear: () => {
      registry.clear()
    },
    get size() {
      return registry.size
    },
  }
}
