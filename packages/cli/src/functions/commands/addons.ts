import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, extname, join, relative } from 'path'
import { spawnSync } from 'node:child_process'
import { pikkuSessionlessFunc } from '#pikku/function'
import { parseOpenAPISpec } from '@pikku/openapi-parser'
import { findInstallRoot } from './update.js'
import { owningPackageDir, wireAddonFile } from './install-addon.js'
import { newAddon, parseHeaderOptions } from './new-addon.js'

export type AddonSource =
  | { kind: 'spec'; spec: string }
  | { kind: 'package'; packageName: string }

const SPEC_EXTENSIONS = ['.yaml', '.yml', '.json']

export function discoverSpec(root: string): string | undefined {
  return SPEC_EXTENSIONS.map((ext) => join(root, 'specs', `api-spec${ext}`)).find(
    (path) => existsSync(path)
  )
}

export function addonSource(
  arg: string | undefined,
  root: string
): AddonSource | undefined {
  if (!arg) {
    const spec = discoverSpec(root)
    return spec ? { kind: 'spec', spec } : undefined
  }
  if (/^https?:\/\//.test(arg)) return { kind: 'spec', spec: arg }
  if (
    SPEC_EXTENSIONS.includes(extname(arg)) ||
    arg.startsWith('.') ||
    existsSync(join(root, arg))
  ) {
    return { kind: 'spec', spec: arg }
  }
  return { kind: 'package', packageName: addonPackageName(arg) }
}

export function addonPackageName(name: string): string {
  if (name.startsWith('@') || name.includes('addon-')) return name
  return `@pikku/addon-${name.replace(/^addon-/, '')}`
}

export function addonCamelName(packageName: string): string {
  const bare = packageName.replace(/^@[^/]+\//, '').replace(/^(pikku-)?addon-/, '')
  return bare.replace(/[-_]([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

export interface AddonRequirements {
  secrets: string[]
  variables: string[]
  credentials: string[]
}

const metaKeys = (path: string, pick: (entry: any, key: string) => string) =>
  existsSync(path)
    ? Object.entries(JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>).map(
        ([key, entry]) => pick(entry, key)
      )
    : []

export function addonRequirements(addonDir: string): AddonRequirements | undefined {
  const meta = join(addonDir, 'dist', '.pikku', 'addon')
  if (!existsSync(meta)) return undefined
  return {
    secrets: metaKeys(
      join(meta, 'secrets', 'pikku-secrets-meta.gen.json'),
      (entry, key) => entry.secretId ?? key
    ),
    variables: metaKeys(
      join(meta, 'variables', 'pikku-variables-meta.gen.json'),
      (entry, key) => entry.variableId ?? key
    ),
    credentials: metaKeys(
      join(meta, 'credentials', 'pikku-credentials-meta.gen.json'),
      (entry, key) => entry.name ?? key
    ),
  }
}

export function requirementLines(requirements: AddonRequirements | undefined): string[] {
  if (!requirements) return ['Not built yet — build the addon to see the secrets, variables and credentials it needs.']
  const lines = [
    ...requirements.secrets.map((name) => `secret ${name}`),
    ...requirements.variables.map((name) => `variable ${name}`),
    ...requirements.credentials.map((name) => `credential ${name} (each user connects their own)`),
  ]
  return lines.length ? ['Fill these in:', ...lines.map((line) => `  ${line}`)] : ['Nothing to fill in.']
}

function installedPackageDir(from: string, packageName: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dirname(dir) === dir) return undefined
  }
}

const AUTH_MODES = ['user', 'shared', 'none']

export const pikkuAddonsAdd = pikkuSessionlessFunc<
  {
    nameOrSpec?: string
    auth?: string
    name?: string
    openapiHeader?: string[]
    tags?: string[]
    include?: string[]
    exclude?: string[]
    build?: boolean
  },
  void
>({
  func: async (services, input) => {
    const { logger, config } = services
    const root: string = config.rootDir
    const srcDir = config.srcDirectories?.[0] ? join(root, config.srcDirectories[0]) : undefined
    if (!srcDir || config.addon || !existsSync(join(root, 'pikku.config.json'))) {
      logger.error('pikku addons add runs inside a pikku app (a pikku.config.json that is not an addon)')
      process.exit(1)
    }

    const source = addonSource(input.nameOrSpec, root)
    if (!source) {
      logger.error('Name a published addon or an OpenAPI spec — no specs/api-spec.yaml|yml|json here to use')
      process.exit(1)
    }

    if (source.kind === 'spec') {
      if (!input.auth || !AUTH_MODES.includes(input.auth)) {
        logger.error(
          'Adding from a spec needs --auth user | shared | none: user if each user connects their own account, shared for one key behind every user, none for a public API'
        )
        process.exit(1)
      }
      const name =
        input.name ??
        (await parseOpenAPISpec(source.spec, { headers: parseHeaderOptions(input.openapiHeader) })).info.title
      const addonDir = await newAddon(services, {
        name,
        openapi: source.spec,
        openapiHeader: input.openapiHeader,
        auth: input.auth,
        tags: input.tags,
        include: input.include,
        exclude: input.exclude,
        install: true,
        build: input.build ?? true,
      })
      for (const line of requirementLines(addonRequirements(addonDir))) logger.info(line)
      console.log(addonDir)
      return
    }

    const packageDir = owningPackageDir(srcDir, root) ?? root
    const { packageManager } = findInstallRoot(packageDir)
    if (packageManager === 'unknown') {
      logger.error(`Could not tell which package manager owns ${packageDir}`)
      process.exit(1)
    }
    logger.info(`${packageManager} add ${source.packageName} (${packageDir})`)
    const added = spawnSync(packageManager, ['add', source.packageName], {
      cwd: packageDir,
      stdio: 'inherit',
    })
    if (added.status !== 0) {
      logger.error(`${packageManager} add ${source.packageName} failed`)
      process.exit(1)
    }

    const camelName = addonCamelName(source.packageName)
    const addonsDir = existsSync(join(srcDir, 'addons')) ? join(srcDir, 'addons') : srcDir
    const wirePath = join(addonsDir, `${camelName}.addon.ts`)
    if (existsSync(wirePath)) {
      logger.warn(`${relative(root, wirePath)} already exists — left as it is`)
    } else {
      mkdirSync(addonsDir, { recursive: true })
      writeFileSync(
        wirePath,
        wireAddonFile({
          projectRoot: root,
          srcDir,
          name: camelName,
          camelName,
          pascalName: camelName,
          screamingName: camelName,
          packageName: source.packageName,
          addonDir: '',
          inWorkspace: false,
          mode: 'none',
          functions: {},
        })
      )
      logger.info(`  wrote ${relative(root, wirePath)}`)
    }

    const installed = installedPackageDir(packageDir, source.packageName)
    if (installed) for (const line of requirementLines(addonRequirements(installed))) logger.info(line)
  },
})
