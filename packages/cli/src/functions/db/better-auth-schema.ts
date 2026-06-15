import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import type { Kysely } from 'kysely'
import { PIKKU_BETTER_AUTH } from '@pikku/better-auth'
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
  | ((config: BetterAuthOptionsLike) => Promise<GetMigrationsResult>)
  | null = null

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

  const instance = await factory(
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
