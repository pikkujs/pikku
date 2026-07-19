import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileFunction } from 'node:vm'
import type { transformSync as EsbuildTransformSync } from 'esbuild'

// Evictable module runner for hot-reload.
//
// Re-importing a changed user file through the native ESM loader (a fresh
// `data:` URL on Node, a fresh temp-file path on Bun) is unbounded: the loader
// keeps a `Map<url, moduleRecord>` for the realm lifetime with no eviction API,
// so every reload permanently leaks a module record and the dev server
// eventually OOMs (worse on Bun). Instead we own the registry: transpile the
// source to CJS (esbuild), run it as a plain function via `vm.compileFunction`
// — which produces a garbage-collectable function rather than a permanent
// loader entry — and store the resulting exports under a STABLE path key. A
// reload overwrites that one slot, so the previous module becomes unreachable
// and is collected. `import`s inside the user file are delegated to
// `createRequire`, whose resolution matches the native loader AND returns the
// same live singletons (Node/Bun share the require/import module cache), so
// top-level side effects (wireHTTP et al) mutate the same running services.
type EsbuildTransform = typeof EsbuildTransformSync

let transformSync: EsbuildTransform | undefined

const loadTransform = async (): Promise<EsbuildTransform> => {
  if (transformSync) return transformSync
  // esbuild is a dev-only dependency, hoisted from @pikku/cli at runtime — the
  // same lazy pattern the reloader previously used for tsx. It is never loaded
  // in production runtimes (the `./dev` export is dev-only).
  const esbuild = await import('esbuild')
  transformSync = esbuild.transformSync
  return transformSync
}

export interface PikkuModuleRunner {
  /** Run a user module by absolute path, returning its exports. Repeated runs
   *  of the same path overwrite a single registry slot (the previous module is
   *  collected). Returns `null` if transpile/compile/evaluation fails, so the
   *  caller can keep the previously-loaded code. */
  run: (absPath: string) => Promise<Record<string, unknown> | null>
  /** Drop a single module from the registry. */
  evict: (absPath: string) => void
  /** Drop every module from the registry. */
  clear: () => void
  /** Number of modules currently held. */
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
      // No sourcemap: an inline sourcemap embeds a base64 copy of the source
      // that the engine retains per compile, reintroducing linear growth on
      // Node — the exact leak this runner exists to remove. `filename` still
      // anchors stack traces to the user file.
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
      // Transpile/compile/evaluate failure (a bad edit, or the one known
      // limitation — a file using top-level `await`, which can't be emitted in
      // `cjs` form). Return null so the caller keeps the previously-loaded code.
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
