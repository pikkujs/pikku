import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import type { Kysely } from 'kysely'
import { loadUserModule } from '../commands/load-user-project.js'

/**
 * Bridge to Better Auth's own migration generator. The CLI never hand-writes the
 * auth schema — it asks Better Auth for it via `getMigrations`, run through the
 * project's own kysely (so the CamelCasePlugin renders snake_case columns).
 *
 * Important: Better Auth's `getMigrations` field-level diff arrays
 * (`toBeCreated`/`toBeAdded`) compare its camelCase field keys against the
 * introspected snake_case columns, so they are unreliable here. We use only
 * `runMigrations()` / `compileMigrations()` (whose output IS correct snake_case)
 * and compute drift ourselves by introspecting a materialised schema — see
 * local-db.ts.
 */

/** Minimal shape of the value `defineAuth(...)` returns. */
interface DefinedAuthLike {
  getInstance: (services: unknown) => Promise<unknown>
}

/** Minimal shape of the resolved better-auth options we need. */
export interface BetterAuthOptionsLike {
  database?: { db?: unknown; type?: string }
  [key: string]: unknown
}

export interface GetMigrationsResult {
  toBeCreated: unknown[]
  toBeAdded: unknown[]
  runMigrations: () => Promise<void>
  compileMigrations: () => Promise<string>
}

let cachedGetMigrations:
  | ((config: BetterAuthOptionsLike) => Promise<GetMigrationsResult>)
  | null = null

/**
 * `getMigrations` is not in better-auth's package `exports`, so resolve the
 * package root and import the internal module by absolute file URL.
 */
async function loadGetMigrations() {
  if (cachedGetMigrations) return cachedGetMigrations
  const require = createRequire(import.meta.url)
  // better-auth's `exports` map does NOT expose `./package.json` nor the
  // internal `get-migration` module, so resolve the package's main entry and
  // walk up to the package root (the dir holding its package.json).
  const mainEntry = require.resolve('better-auth')
  let root = dirname(mainEntry)
  while (!existsSync(join(root, 'package.json'))) {
    const parent = dirname(root)
    if (parent === root) {
      throw new Error('Could not locate the better-auth package root')
    }
    root = parent
  }
  const modUrl = pathToFileURL(join(root, 'dist/db/get-migration.mjs')).href
  const mod = await import(modUrl)
  cachedGetMigrations = mod.getMigrations
  return cachedGetMigrations!
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.pikku',
  '.git',
  'dist',
  '.pikku-runtime',
])

/** Find the single source file that declares a `defineAuth(...)` export. */
function findAuthSourceFile(
  rootDir: string,
  srcDirectories: string[]
): string | null {
  const walk = (dir: string): string | null => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return null
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        const found = walk(full)
        if (found) return found
        continue
      }
      if (extname(full) !== '.ts') continue
      let src: string
      try {
        src = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      if (/\bdefineAuth\s*\(/.test(src)) return full
    }
    return null
  }

  for (const srcDir of srcDirectories) {
    const found = walk(join(rootDir, srcDir))
    if (found) return found
  }
  return walk(rootDir)
}

async function loadDefinedAuth(
  sourceFile: string
): Promise<DefinedAuthLike | null> {
  const mod = await loadUserModule(sourceFile)
  for (const value of Object.values(mod)) {
    if (
      value &&
      typeof (value as DefinedAuthLike).getInstance === 'function'
    ) {
      return value as DefinedAuthLike
    }
  }
  return null
}

/**
 * A schema-only `services` stub. The `defineAuth` factory must be side-effect
 * free (it just constructs `betterAuth(options)`), so dummy secrets/variables
 * and the supplied kysely are enough to obtain the resolved options. Any other
 * service it reaches for resolves to `undefined` rather than throwing.
 */
function schemaServicesStub(kysely: Kysely<any>, logger: unknown) {
  const dummy = 'x'.repeat(32)
  const fromKeys = (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, dummy]))
  const base: Record<string, unknown> = {
    kysely,
    logger,
    secrets: {
      getSecret: async () => dummy,
      getSecrets: async (keys: string[]) => fromKeys(keys),
    },
    variables: {
      getVariable: async () => dummy,
      getVariables: async (keys: string[]) => fromKeys(keys),
    },
  }
  return new Proxy(base, {
    get: (target, prop) =>
      typeof prop === 'string' && prop in target ? target[prop] : undefined,
  })
}

/**
 * Resolve the project's `defineAuth` options with `database.db` bound to the
 * supplied kysely. Returns null when the project declares no `defineAuth`.
 */
export async function loadAuthOptions(opts: {
  rootDir: string
  srcDirectories: string[]
  kysely: Kysely<any>
  logger: { error: (msg: string) => void }
}): Promise<BetterAuthOptionsLike | null> {
  const sourceFile = findAuthSourceFile(opts.rootDir, opts.srcDirectories)
  if (!sourceFile) return null

  const defined = await loadDefinedAuth(sourceFile)
  if (!defined) return null

  const instance = await defined.getInstance(
    schemaServicesStub(opts.kysely, opts.logger)
  )
  const options = (instance as { options?: BetterAuthOptionsLike }).options
  return options ?? null
}

export async function getAuthMigrations(
  authOptions: BetterAuthOptionsLike
): Promise<GetMigrationsResult> {
  const getMigrations = await loadGetMigrations()
  return getMigrations(authOptions)
}
