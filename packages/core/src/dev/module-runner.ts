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

/** The outcome of one run. A failure carries its error rather than collapsing
 *  to `null`: the caller keeps serving the previously-loaded code, so unless the
 *  reason travels with the failure the running process silently disagrees with
 *  the file on disk and nothing anywhere says why. */
export type PikkuModuleRunResult =
  { ok: true; exports: Record<string, unknown> } | { ok: false; error: Error }

export interface PikkuModuleRunner {
  /** Run a user module by absolute path. Repeated runs of one path overwrite a
   *  single registry slot. Failure is returned, not thrown, so the caller can
   *  keep the previously-loaded code — and the discriminant makes that case
   *  impossible to read past by accident. */
  run: (absPath: string) => Promise<PikkuModuleRunResult>
  evict: (absPath: string) => void
  clear: () => void
  readonly size: number
}

/** esbuild states pikku's one documented reload limitation only in the text of
 *  its transform error. Matching it is worth the fragility: the developer's file
 *  is correct, and no amount of re-reading it will reveal that the reloader —
 *  not the file — is what cannot cope. */
export const isTopLevelAwaitLimitation = (error: Error): boolean =>
  /top-level await/i.test(error.message)

export const createModuleRunner = (): PikkuModuleRunner => {
  const registry = new Map<string, Record<string, unknown>>()

  const run = async (filePath: string): Promise<PikkuModuleRunResult> => {
    const absPath = resolve(filePath)
    try {
      const transform = await loadTransform()
      const source = await readFile(absPath, 'utf-8')
      // `cjs` output rewrites `import.meta` to an empty object, so a module
      // that resolves its own neighbours through `createRequire(import.meta.url)`
      // -- sharp, onnxruntime-node, any package with a native binding -- gets
      // `undefined` and fails with "Cannot find module ... from ''".
      const { code } = transform(source, {
        loader: absPath.endsWith('.ts') ? 'ts' : 'js',
        format: 'cjs',
        sourcefile: absPath,
        define: {
          'import.meta.url': JSON.stringify(pathToFileURL(absPath).href),
          'import.meta.filename': JSON.stringify(absPath),
          'import.meta.dirname': JSON.stringify(dirname(absPath)),
        },
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
      return { ok: true, exports: moduleObj.exports }
    } catch (thrown) {
      // A bad edit, or the one known limitation: a file using top-level
      // `await`, which cannot be emitted in `cjs` form. Normalised to an
      // `Error` so the caller always has a message and a stack to print
      // without re-deriving them; a non-`Error` throw keeps its original value
      // as the `cause`.
      return {
        ok: false,
        error:
          thrown instanceof Error
            ? thrown
            : new Error(String(thrown), { cause: thrown }),
      }
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
