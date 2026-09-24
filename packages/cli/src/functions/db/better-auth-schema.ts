import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import type { Kysely } from 'kysely'
import { PIKKU_BETTER_AUTH } from '@pikku/better-auth'
import { createSecretValue } from '@pikku/core/classification'
import { LocalVariablesService } from '@pikku/core/services'
import { loadUserModule } from '../commands/load-user-project.js'

type AuthFactoryLike = (services: unknown) => unknown

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
  ((config: BetterAuthOptionsLike) => Promise<GetMigrationsResult>) | null =
  null

async function loadGetMigrations() {
  if (cachedGetMigrations) return cachedGetMigrations
  const require = createRequire(import.meta.url)
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
      if (/\bpikkuBetterAuth\s*\(/.test(src)) return full
    }
    return null
  }

  for (const srcDir of srcDirectories) {
    const found = walk(join(rootDir, srcDir))
    if (found) return found
  }
  return walk(rootDir)
}

async function loadAuthFactory(
  sourceFile: string
): Promise<AuthFactoryLike | null> {
  const mod = await loadUserModule(sourceFile)
  for (const value of Object.values(mod)) {
    if (typeof value === 'function' && (value as any)[PIKKU_BETTER_AUTH]) {
      return value as AuthFactoryLike
    }
  }
  return null
}

// Schema-only auth introspection never executes auth — it just reads the Better
// Auth options to derive the table/column shape. Secret *values* don't affect the
// schema, so we hand the factory a fake secret service that resolves every key to
// a placeholder. This keeps `pikku db migrate`'s drift check from requiring the
// app's real secrets (BETTER_AUTH_SECRET etc.) to be present in the environment.
function fakeSecretService() {
  const placeholder = 'schema-introspection-only'
  return {
    getSecret: async () => createSecretValue(placeholder),
    // Every key resolves, for the same reason `hasSecret` says yes to all of
    // them: an auth factory that batches its secrets must come back with the
    // whole batch, or it throws on the one it considers required and the
    // schema is never read at all.
    getSecrets: async (keys: string[]) =>
      Object.fromEntries(
        keys.map((key) => [key, createSecretValue(placeholder)])
      ),
    hasSecret: async () => true,
    setSecret: async () => {},
  }
}

function schemaServicesStub(kysely: Kysely<any>, logger: unknown) {
  const variables = new LocalVariablesService()
  const secrets = fakeSecretService()
  const base: Record<string, unknown> = {
    kysely,
    logger,
    secrets,
    variables,
  }
  return new Proxy(base, {
    get: (target, prop) =>
      typeof prop === 'string' && prop in target ? target[prop] : undefined,
  })
}

function findUserConfigFactoryFile(
  rootDir: string,
  srcDirectories: string[]
): string | null {
  for (const srcDir of srcDirectories) {
    for (const name of ['config.ts', 'config.js']) {
      const candidate = join(rootDir, srcDir, name)
      if (existsSync(candidate)) return candidate
    }
  }

  for (const name of ['config.ts', 'config.js']) {
    const candidate = join(rootDir, name)
    if (existsSync(candidate)) return candidate
  }

  return null
}

async function loadAuthConfig(opts: {
  rootDir: string
  srcDirectories: string[]
}): Promise<unknown | undefined> {
  const configFactoryFile = findUserConfigFactoryFile(
    opts.rootDir,
    opts.srcDirectories
  )
  if (!configFactoryFile) return undefined

  const configModule = await loadUserModule(configFactoryFile)
  const userCreateConfig = configModule.createConfig
  if (typeof userCreateConfig !== 'function') return undefined

  return userCreateConfig(new LocalVariablesService())
}

/**
 * Build the auth instance without a plugin's background init being able to kill
 * the process.
 *
 * Reading the schema means reading `options`, which Better Auth assembles while
 * the constructor runs — but from 1.7 a plugin's `init` also starts real work
 * and does not wait for it. The OAuth provider behind `@better-auth/mcp` seeds
 * its `oauthResource` rows this way. Here that work has nowhere to go: the
 * database it is handed is a throwaway whose auth tables do not exist yet, and
 * on the SQLite path the handle is closed as soon as the options have been
 * read. The seed then rejects with nothing awaiting it, and Node's default for
 * an unhandled rejection is to terminate — so `pikku db generate` died on
 * `database is not open`, from a write the schema derivation never wanted, in a
 * project whose only offence was configuring MCP.
 *
 * Rejections are reported rather than swallowed: they say a plugin tried to
 * touch the database while being introspected, which is worth seeing, but never
 * worth failing the command over. Whatever the plugin was doing is irrelevant
 * to the shape of its tables, which is all that is being read.
 *
 * The handler is installed only around the call and only added to whatever the
 * host already has, so a real unhandled rejection anywhere else still behaves
 * exactly as it did.
 */
async function withoutPluginInitCrashing<T>(build: () => T | Promise<T>): Promise<T> {
  const existing = process.listeners('unhandledRejection')
  const swallow = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    debugInitRejection(message)
  }
  for (const listener of existing) {
    process.off('unhandledRejection', listener)
  }
  process.on('unhandledRejection', swallow)
  try {
    const instance = await build()
    // One turn of the loop, so an init that rejects immediately does so while
    // the guard is still the only listener. A slower one is caught by the
    // `swallow` handler that outlives this only if the host had none of its
    // own — which is why the originals go back on before it comes off.
    await new Promise((resolve) => setImmediate(resolve))
    return instance
  } finally {
    for (const listener of existing) {
      process.on('unhandledRejection', listener)
    }
    process.off('unhandledRejection', swallow)
  }
}

function debugInitRejection(message: string): void {
  if (process.env.PIKKU_DEBUG) {
    // eslint-disable-next-line no-console
    console.debug(
      `[pikku] a Better Auth plugin's init failed while its schema was being read, which does not affect the schema: ${message}`
    )
  }
}

export async function loadAuthOptions(opts: {
  rootDir: string
  srcDirectories: string[]
  kysely: Kysely<any>
  logger: { error: (msg: string) => void }
}): Promise<BetterAuthOptionsLike | null> {
  const sourceFile = findAuthSourceFile(opts.rootDir, opts.srcDirectories)
  if (!sourceFile) return null

  const factory = await loadAuthFactory(sourceFile)
  if (!factory) return null

  const services = schemaServicesStub(opts.kysely, opts.logger) as Record<
    string,
    unknown
  >
  services.config = await loadAuthConfig(opts)

  const instance = await withoutPluginInitCrashing(() => factory(services))
  const options = (instance as { options?: BetterAuthOptionsLike }).options
  return options ?? null
}

export async function getAuthMigrations(
  authOptions: BetterAuthOptionsLike
): Promise<GetMigrationsResult> {
  const getMigrations = await loadGetMigrations()
  return getMigrations(authOptions)
}
