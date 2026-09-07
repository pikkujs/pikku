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

interface BunResolver {
  resolveSync: (specifier: string, parent: string) => string
}

/** The `require` a reloaded module is run with.
 *
 *  On Bun, `createRequire`'s referrer stops being honoured somewhere in a
 *  long-running process: the same relative specifier that resolves in a fresh
 *  script fails inside a `pikku dev` that has been up for a while, so a file
 *  importing `./sibling.js` reloads as `Cannot find module` and the developer
 *  is left serving the previous code from an edit that looked applied. Bun's
 *  own resolver still answers correctly when handed the importer's directory
 *  outright, so the specifier is resolved to an absolute path first and the
 *  referrer never has to survive the trip. Anything Bun's resolver declines —
 *  builtins among them — falls through to `require` unchanged.
 */
const createRequireForFile = (absPath: string): NodeRequire => {
  const base = createRequire(pathToFileURL(absPath))
  const bun = (globalThis as { Bun?: BunResolver }).Bun
  if (!bun) return base

  const importerDir = dirname(absPath)
  const resolveThroughBun = (specifier: string): string => {
    try {
      return bun.resolveSync(specifier, importerDir)
    } catch {
      return specifier
    }
  }

  // Only resolution is delegated; the require itself stays outside the guard so
  // a module that throws while evaluating reports its own error rather than
  // being retried under a second specifier.
  const bunRequire = ((specifier: string) =>
    base(resolveThroughBun(specifier))) as NodeRequire
  return Object.assign(bunRequire, base)
}

export const createModuleRunner = (): PikkuModuleRunner => {
  const registry = new Map<string, Record<string, unknown>>()

  const run = async (filePath: string): Promise<PikkuModuleRunResult> => {
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

      const require = createRequireForFile(absPath)
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
