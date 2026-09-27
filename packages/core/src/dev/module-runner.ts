import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
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

const TYPESCRIPT_FILE = /\.(m|c)?tsx?$/

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** Where a relative specifier's TypeScript source lives, for the specifiers a
 *  plain `require` cannot resolve. A TS project writes `./sibling.js` for a file
 *  that only exists as `./sibling.ts`, and a reloaded module is the source, so
 *  every one of its relative imports arrives in that unresolvable form. */
const findTypeScriptSource = (
  specifier: string,
  importerDir: string
): string | undefined => {
  if (!specifier.startsWith('.') && !isAbsolute(specifier)) return undefined
  const base = resolve(importerDir, specifier)
  const withoutJs = base.replace(/\.(m|c)?js$/, '')
  const candidates = [
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${withoutJs}.mts`,
    `${withoutJs}.cts`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  return candidates.find(isFile)
}

const isProjectTypeScript = (path: string): boolean =>
  TYPESCRIPT_FILE.test(path) && !path.includes(`${sep}node_modules${sep}`)

/** JSX is a syntax esbuild only parses when asked, so a `.tsx` helper handed to
 *  the `ts` loader fails to compile and the file importing it keeps its old
 *  code. */
const loaderFor = (path: string): 'tsx' | 'ts' | 'jsx' | 'js' => {
  if (path.endsWith('.tsx')) return 'tsx'
  if (TYPESCRIPT_FILE.test(path)) return 'ts'
  if (path.endsWith('.jsx')) return 'jsx'
  return 'js'
}

/** One reload's view of the TypeScript modules it had to evaluate itself.
 *  Scoped to the reload rather than kept: a helper edited alongside the
 *  function that imports it has to be read from disk again, or the reload
 *  applies half the developer's change. */
type TsModuleCache = Map<string, Record<string, unknown>>

const evaluateModule = (
  absPath: string,
  cache: TsModuleCache
): Record<string, unknown> => {
  const cached = cache.get(absPath)
  if (cached) return cached

  const source = readFileSync(absPath, 'utf-8')
  const { code } = transformSync!(source, {
    loader: loaderFor(absPath),
    format: 'cjs',
    sourcefile: absPath,
  })

  const fn = compileFunction(
    code,
    ['require', 'exports', 'module', '__filename', '__dirname'],
    { filename: absPath }
  )

  const moduleObj: { exports: Record<string, unknown> } = { exports: {} }
  // Seeded before evaluation so an import cycle terminates the way CJS's own
  // cache makes it terminate, and overwritten after because esbuild's `cjs`
  // emit assigns a fresh `module.exports` on the way out.
  cache.set(absPath, moduleObj.exports)
  fn(
    createRequireForFile(absPath, cache),
    moduleObj.exports,
    moduleObj,
    absPath,
    dirname(absPath)
  )
  cache.set(absPath, moduleObj.exports)
  return moduleObj.exports
}

/** The `require` a reloaded module is run with.
 *
 *  Resolution goes through the host first, so every package binds to the
 *  instance the rest of the process holds and a user file's `wire*` side
 *  effect mutates live state rather than a private copy.
 *
 *  A resolved TypeScript file outside `node_modules` is the project's own
 *  source, and is compiled here instead of handed back to the host: both hosts
 *  cache what they load, so a helper edited alongside the function importing it
 *  would otherwise keep answering with the version loaded at startup — the same
 *  stale-code-under-a-successful-reload the reloader exists to avoid.
 *
 *  On Bun, `createRequire`'s referrer stops being honoured somewhere in a
 *  long-running process: the same relative specifier that resolves in a fresh
 *  script fails inside a `pikku dev` that has been up for a while, so a file
 *  importing `./sibling.js` reloads as `Cannot find module` and the developer
 *  is left serving the previous code from an edit that looked applied. Bun's
 *  own resolver still answers correctly when handed the importer's directory
 *  outright, so the specifier is resolved to an absolute path first and the
 *  referrer never has to survive the trip.
 *
 *  What neither host resolves is a relative `./sibling.js` whose only file on
 *  disk is `./sibling.ts` — node's `require` has no `.js → .ts` rewrite, and
 *  the reloader hands it source. Those, and only those, are compiled here.
 */
const createRequireForFile = (
  absPath: string,
  cache: TsModuleCache
): NodeRequire => {
  const base = createRequire(pathToFileURL(absPath))
  const bun = (globalThis as { Bun?: BunResolver }).Bun
  const importerDir = dirname(absPath)

  const resolveThroughHost = (specifier: string): string | undefined => {
    if (bun) {
      try {
        return bun.resolveSync(specifier, importerDir)
      } catch {
        return undefined
      }
    }
    try {
      return base.resolve(specifier)
    } catch {
      return undefined
    }
  }

  // Only resolution is delegated; the require itself stays outside the guard so
  // a module that throws while evaluating reports its own error rather than
  // being retried under a second specifier.
  const loadingRequire = ((specifier: string) => {
    const resolved =
      resolveThroughHost(specifier) ??
      findTypeScriptSource(specifier, importerDir)
    if (!resolved) return base(specifier)
    if (isProjectTypeScript(resolved)) return evaluateModule(resolved, cache)
    return base(resolved)
  }) as NodeRequire
  return Object.assign(loadingRequire, base)
}

export const createModuleRunner = (): PikkuModuleRunner => {
  const registry = new Map<string, Record<string, unknown>>()

  const run = async (filePath: string): Promise<PikkuModuleRunResult> => {
    const absPath = resolve(filePath)
    try {
      await loadTransform()
      const exports = evaluateModule(absPath, new Map())

      registry.set(absPath, exports)
      return { ok: true, exports }
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
