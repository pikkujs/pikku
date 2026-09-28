import { isAbsolute, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import {
  loadSqliteRuntime,
  type SyncSqliteDatabase,
} from '@pikku/migrator-sql/sqlite'
import { sqliteLibraryFallbackReason } from './sqlite-library.js'

/**
 * Loaded when a project says nothing: vector search over embeddings is common
 * enough that `CREATE VIRTUAL TABLE ... USING vec0(...)` should just work, the
 * same way `CREATE EXTENSION vector` does on the Postgres side.
 */
export const DEFAULT_SQLITE_EXTENSIONS = ['sqlite-vec']

export interface SqliteExtensionContext {
  rootDir: string
  /** Specifiers from `db.sqliteExtensions`, or the defaults. */
  sqliteExtensions: string[]
  /**
   * Whether the project named them itself. A declared extension that cannot be
   * loaded is an error; a default one is skipped, and only mentioned if a
   * migration then turns out to need it.
   */
  sqliteExtensionsDeclared: boolean
}

interface LoadedExtensions {
  paths: string[]
  /** Why the defaults were skipped, when they were. */
  skipped?: string
}

const loaded = new Map<string, Promise<LoadedExtensions>>()
const settled = new Map<string, LoadedExtensions>()

const cacheKey = (context: SqliteExtensionContext) =>
  [context.rootDir, ...context.sqliteExtensions].join('\0')

/**
 * Turn a declared specifier into the file SQLite loads.
 *
 * A path (`./native/my_ext.dylib`) is taken relative to the project. Anything
 * else is a package that publishes a loadable extension the way sqlite-vec
 * does, through a `getLoadablePath()` export — resolved from the project first
 * and then from the CLI, which ships sqlite-vec itself.
 */
export function resolveSqliteExtension(spec: string, rootDir: string): string {
  if (spec.startsWith('.') || isAbsolute(spec)) {
    return isAbsolute(spec) ? spec : resolve(rootDir, spec)
  }

  for (const from of [join(rootDir, 'package.json'), import.meta.url]) {
    const require = createRequire(from)
    let module: { getLoadablePath?: unknown }
    try {
      module = require(spec)
    } catch (error: any) {
      if (error?.code === 'MODULE_NOT_FOUND') continue
      throw error
    }
    if (typeof module.getLoadablePath !== 'function') {
      throw new Error(
        `The SQLite extension package '${spec}' has no getLoadablePath() ` +
          `export, so there is no telling which file to load. Name the ` +
          `extension's library file by path instead.`
      )
    }
    return module.getLoadablePath()
  }

  throw new Error(
    `The SQLite extension '${spec}' could not be resolved from either the ` +
      `project (${rootDir}) or the pikku CLI. Install it in your project, or ` +
      `name the extension's library file by path.`
  )
}

async function loadExtensions(
  context: SqliteExtensionContext
): Promise<LoadedExtensions> {
  const runtime = await loadSqliteRuntime()
  try {
    const paths = context.sqliteExtensions.map((spec) =>
      resolveSqliteExtension(spec, context.rootDir)
    )
    // Load them once into a throwaway connection, so a runtime that refuses
    // extensions is found out here, once, rather than by every open.
    runtime.open(':memory:', { extensions: paths }).close()
    return { paths }
  } catch (error: any) {
    const reason = error?.message ?? String(error)
    if (context.sqliteExtensionsDeclared) {
      throw new Error(
        `db.sqliteExtensions could not be loaded: ${reason}${hintFor(reason)}`,
        { cause: error }
      )
    }
    return { paths: [], skipped: reason }
  }
}

/**
 * Bun on macOS opens Apple's system SQLite, which is built without extension
 * loading, unless the CLI found another libsqlite3 at startup — the one place
 * the failure is the runtime's rather than the extension's, so point at the way
 * round it.
 */
function hintFor(reason: string): string {
  if (!/does not support dynamic extension loading/.test(reason)) return ''
  const fallback = sqliteLibraryFallbackReason()
  return (
    " (this is Apple's SQLite, which bun on macOS falls back to" +
    (fallback ? ` because ${fallback}` : '') +
    '; or run the CLI on Node 24+)'
  )
}

/**
 * The library files to load into every connection for this project, resolved
 * and tried once per process. For callers that must open synchronously;
 * everything else uses {@link openSqlite}.
 */
export async function sqliteExtensionPaths(
  context: SqliteExtensionContext
): Promise<string[]> {
  const key = cacheKey(context)
  let pending = loaded.get(key)
  if (!pending) {
    pending = loadExtensions(context).then((result) => {
      settled.set(key, result)
      return result
    })
    // A failure is not cached: the next open tries again, and reports again.
    pending.catch(() => loaded.delete(key))
    loaded.set(key, pending)
  }
  return (await pending).paths
}

/**
 * Open a SQLite database with the project's extensions loaded.
 *
 * Every connection the CLI opens onto project schema goes through here, so a
 * migration, the schema it is introspected from and the dev server all see the
 * same virtual table modules and functions.
 */
export async function openSqlite(
  context: SqliteExtensionContext,
  filename: string
): Promise<SyncSqliteDatabase> {
  const extensions = await sqliteExtensionPaths(context)
  const runtime = await loadSqliteRuntime()
  return runtime.open(filename, { extensions })
}

/**
 * SQLite reports a missing extension as `no such module: vec0` or
 * `no such function: vec_distance_cosine`, which reads as a typo in the SQL.
 * Name the actual cause: the extension is not loaded, and either why not or how
 * to load it.
 */
export function explainMissingSqliteExtension(
  error: unknown,
  context: SqliteExtensionContext
): unknown {
  const message = error instanceof Error ? error.message : ''
  const match = /no such (module|function): (\w+)/.exec(message)
  if (!match) return error

  const [, kind, name] = match
  const isVec = name === 'vec0' || name.startsWith('vec_')
  if (kind === 'function' && !isVec) return error

  const skipped = settled.get(cacheKey(context))?.skipped
  let explanation: string
  if (isVec && skipped) {
    explanation =
      `sqlite-vec is loaded by default, but could not be loaded here: ` +
      `${skipped}${hintFor(skipped)}`
  } else if (isVec && !context.sqliteExtensions.includes('sqlite-vec')) {
    explanation =
      `'${name}' comes from sqlite-vec, which db.sqliteExtensions leaves out. ` +
      `Add 'sqlite-vec' to it.`
  } else {
    explanation =
      `No loaded SQLite extension provides '${name}'. Add the extension that ` +
      `does to db.sqliteExtensions in pikku.config.json.`
  }

  return new Error(`${message}\n\n${explanation}`, { cause: error })
}
