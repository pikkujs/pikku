import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join, relative } from 'path'

export type AddonAuthMode = 'delegated' | 'connect' | 'oauth2' | 'shared' | 'none'

export interface AddonInstall {
  projectRoot: string
  srcDir: string
  name: string
  camelName: string
  pascalName: string
  screamingName: string
  packageName: string
  depProtocol: string
  mode: AddonAuthMode
  /** Generated function file contents by function name. */
  functions: Record<string, string>
  baseUrl?: string
}

export interface InstallResult {
  written: string[]
  notes: string[]
}

/** The package.json that owns `dir`, walking up to `stopAt`. */
export function owningPackageDir(dir: string, stopAt: string): string | undefined {
  let current = dir
  while (current.startsWith(stopAt)) {
    if (existsSync(join(current, 'package.json'))) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

export function addDependency(
  packageJsonPath: string,
  packageName: string,
  version: string
): boolean {
  const pkg = readJson(packageJsonPath)
  if (pkg.dependencies?.[packageName] ?? pkg.devDependencies?.[packageName]) {
    return false
  }
  pkg.dependencies = Object.fromEntries(
    Object.entries({ ...pkg.dependencies, [packageName]: version }).sort(
      ([a], [b]) => a.localeCompare(b)
    )
  )
  writeJson(packageJsonPath, pkg)
  return true
}

/**
 * What a signed-in user may call directly. Per-user modes expose every
 * function, since the upstream enforces the user's own permissions; a shared
 * secret acts with one identity for everyone, so only reads are exposed.
 */
export function exposedFunctions(install: AddonInstall): string[] {
  const names = Object.keys(install.functions).sort()
  if (install.mode !== 'shared') return names
  return names.filter((fn) => /\.call\("GET"/.test(install.functions[fn]!))
}

export function wireAddonFile(install: AddonInstall): string {
  const expose = exposedFunctions(install)
  const list = expose.length
    ? `[\n${expose.map((fn) => `    '${fn}',`).join('\n')}\n  ]`
    : 'false'
  return `import { wireAddon } from '#pikku/addon'

wireAddon({
  name: '${install.camelName}',
  package: '${install.packageName}',
  auth: true,
  expose: ${list},
})
`
}

const BETTER_AUTH_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*'@pikku\/better-auth'/

function addNamedImport(source: string, name: string): string {
  const match = source.match(BETTER_AUTH_IMPORT)
  if (match) {
    const names = match[1]!.split(',').map((n) => n.trim()).filter(Boolean)
    if (names.includes(name)) return source
    return source.replace(
      match[0],
      `import { ${[...names, name].join(', ')} } from '@pikku/better-auth'`
    )
  }
  return `import { ${name} } from '@pikku/better-auth'\n${source}`
}

function addFactoryService(source: string, service: string): string {
  return source.replace(
    /pikkuBetterAuth\(\s*async\s*\(\{([^}]*)\}\)/,
    (whole, services: string) => {
      const names = services.split(',').map((n) => n.trim()).filter(Boolean)
      if (names.includes(service)) return whole
      return whole.replace(`{${services}}`, `{ ${[...names, service].join(', ')} }`)
    }
  )
}

function insertAfterImports(source: string, line: string): string {
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+'[^']+'[ \t]*\n/gm)]
  const last = imports[imports.length - 1]
  if (!last) return `${line}\n${source}`
  const at = last.index! + last[0].length
  return `${source.slice(0, at)}${line}\n${source.slice(at)}`
}

/**
 * Wires the addon's auth into the app's Better Auth config: delegated sign-in
 * against the upstream, and upstream credentials carried by scenario actors.
 * Text edits, so each one is skipped (and reported) when its anchor is gone.
 */
export function wireAuth(
  source: string,
  install: AddonInstall
): { source: string; notes: string[] } {
  const notes: string[] = []
  const { camelName, pascalName, screamingName, packageName } = install
  const perUser = install.mode !== 'shared' && install.mode !== 'none'
  if (!perUser) return { source, notes }

  const storeCredential = `if (!credentialService) throw new Error('credentialService is not configured')`
  let next = addFactoryService(source, 'credentialService')

  if (install.mode === 'delegated' && !next.includes(`authenticate${pascalName}Upstream`)) {
    if (next.search(/plugins:\s*\[/) === -1) {
      notes.push(`auth.ts has no plugins: [ … ] — add pikkuDelegatedAuth by hand (see pikku-auth)`)
    } else {
      next = addFactoryService(next, 'variables')
      next = addFactoryService(next, 'scopeService')
      next = addFactoryService(next, 'logger')
      next = addNamedImport(next, 'pikkuDelegatedAuth')
      next = insertAfterImports(
        next,
        `import { authenticate${pascalName}Upstream } from '${packageName}'`
      )
      const fallback = install.baseUrl ? ` ?? ${JSON.stringify(install.baseUrl)}` : ''
      const plugin = `
        pikkuDelegatedAuth({
          authenticate: async (credentials) =>
            authenticate${pascalName}Upstream(
              credentials,
              String((await variables.get('${screamingName}_BASE_URL'))${fallback})
            ),
          storeCredential: async (userId, identity) => {
            ${storeCredential}
            await credentialService.set('${camelName}', identity.credential, userId)
          },
          scopeService,
          logger,
        }),`
      const open = next.match(/plugins:\s*\[/)!
      const at = open.index! + open[0].length
      next = `${next.slice(0, at)}${plugin}${next.slice(at)}`
    }
  }

  const actorAt = next.search(/pikkuActor\(\{/)
  if (actorAt === -1) {
    notes.push('auth.ts has no pikkuActor — scenario personas will not carry upstream credentials')
  } else {
    const actorCall = next.slice(actorAt, next.indexOf('})', actorAt) + 2)
    if (!actorCall.includes('credentials:')) {
      const credentials = `pikkuActor({
          credentials: {
            names: ['${camelName}'],
            store: async (name, value, userId) => {
              ${storeCredential}
              await credentialService.set(name, value, userId)
            },
          },`
      next = next.replace(/pikkuActor\(\{/, credentials)
    }
  }
  return { source: next, notes }
}

function addEnvLine(envPath: string, name: string, value: string): boolean {
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  if (new RegExp(`^\\s*${name}\\s*=`, 'm').test(current)) return false
  const sep = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  writeFileSync(envPath, `${current}${sep}${name}=${value}\n`)
  return true
}

/**
 * Installs a freshly generated addon into the app it was generated in: the
 * dependency on the root and functions packages, the wireAddon file, the auth
 * wiring and the base-URL variable. The caller installs and builds after.
 */
export function installAddonIntoApp(install: AddonInstall): InstallResult {
  const written: string[] = []
  const notes: string[] = []
  const rel = (path: string) => relative(install.projectRoot, path)

  const functionsPkg = owningPackageDir(install.srcDir, install.projectRoot)
  const packageDirs = [install.projectRoot]
  if (functionsPkg && functionsPkg !== install.projectRoot) packageDirs.push(functionsPkg)
  for (const dir of packageDirs) {
    const path = join(dir, 'package.json')
    if (existsSync(path) && addDependency(path, install.packageName, install.depProtocol)) {
      written.push(rel(path))
    }
  }

  const addonsDir = existsSync(join(install.srcDir, 'addons'))
    ? join(install.srcDir, 'addons')
    : install.srcDir
  const wirePath = join(addonsDir, `${install.name}.addon.ts`)
  if (existsSync(wirePath)) {
    notes.push(`${rel(wirePath)} already exists — left as it is`)
  } else {
    mkdirSync(addonsDir, { recursive: true })
    writeFileSync(wirePath, wireAddonFile(install))
    written.push(rel(wirePath))
  }

  const authPath = join(install.srcDir, 'auth.ts')
  if (existsSync(authPath)) {
    const before = readFileSync(authPath, 'utf8')
    const { source, notes: authNotes } = wireAuth(before, install)
    notes.push(...authNotes)
    if (source !== before) {
      writeFileSync(authPath, source)
      written.push(rel(authPath))
    }
  } else if (install.mode === 'delegated') {
    notes.push(`no ${rel(authPath)} — add pikkuDelegatedAuth to your Better Auth config by hand (see pikku-auth)`)
  }

  const envPath = join(install.projectRoot, '.env')
  if (addEnvLine(envPath, `${install.screamingName}_BASE_URL`, install.baseUrl ?? '')) {
    written.push(rel(envPath))
  }
  if (!install.baseUrl) {
    notes.push(`the spec names no absolute server — set ${install.screamingName}_BASE_URL in .env`)
  }
  return { written, notes }
}
