import {
  BadRequestError,
  ConflictError,
  LocalEnvironmentOnlyError,
} from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import { findProjectRoot } from '../lib/find-project-root.js'
import {
  deriveInstanceOverrides,
  readAddonDeclaredNames,
  type InstanceOverrides,
} from '../lib/derive-instance-overrides.js'

export const installAddon = pikkuSessionlessFunc<
  {
    packageName: string
    namespace: string
    version?: string
  },
  { success: boolean; message: string }
>({
  title: 'Install Addon',
  description:
    'Installs a community addon package and creates the wiring file.',
  expose: true,
  auth: false,
  func: async ({ metaService }, { packageName, namespace, version }) => {
    const { readFile, writeFile, mkdir, readdir } = await import(
      'node:fs/promises'
    )
    const { join, dirname } = await import('node:path')
    const { existsSync } = await import('node:fs')
    const validPkg = /^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/
    if (!validPkg.test(packageName)) {
      throw new BadRequestError(`Invalid package name: ${packageName}`)
    }
    if (!/^[a-z0-9-]+$/.test(namespace)) {
      throw new BadRequestError(`Invalid namespace: ${namespace}`)
    }
    if (version && !/^[a-z0-9._^~><=|-]+$/i.test(version)) {
      throw new BadRequestError(`Invalid version: ${version}`)
    }

    const metaBasePath = metaService?.basePath
    if (!metaBasePath) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    const rootDir = findProjectRoot(metaBasePath)

    const configPath = join(rootDir, 'pikku.config.json')
    if (!existsSync(configPath)) {
      throw new Error('pikku.config.json not found')
    }
    const config = JSON.parse(await readFile(configPath, 'utf-8'))

    const pikkuDir = config.scaffold?.pikkuDir
    if (!pikkuDir) {
      throw new Error('scaffold.pikkuDir not configured in pikku.config.json')
    }

    const addonDir = join(rootDir, dirname(pikkuDir), 'addons')
    await mkdir(addonDir, { recursive: true })

    const wiringFile = join(addonDir, `${namespace}.addon.ts`)
    if (existsSync(wiringFile)) {
      throw new ConflictError(
        `An addon is already installed under the name "${namespace}". Pick a different instance name.`
      )
    }

    const pkg = version ? `${packageName}@${version}` : packageName

    const pmLock: Record<string, string> = {
      'yarn.lock': 'yarn',
      'pnpm-lock.yaml': 'pnpm',
      'package-lock.json': 'npm',
      'bun.lockb': 'bun',
    }
    let pm = 'yarn'
    for (const [lock, name] of Object.entries(pmLock)) {
      if (existsSync(join(rootDir, lock))) {
        pm = name
        break
      }
    }

    const installArgs: Record<string, string[]> = {
      yarn: ['add', pkg],
      npm: ['install', pkg],
      pnpm: ['add', pkg],
      bun: ['add', pkg],
    }

    const cp = 'node:child_process'
    const { execFileSync } = await import(cp)
    execFileSync(pm, installArgs[pm]!, { cwd: rootDir, stdio: 'pipe' })

    // A second-or-later instance of the SAME package would otherwise resolve to
    // the same secrets/variables/credentials as the first — namespace-scope the
    // new one so the two instances stay isolated. The first instance keeps the
    // package's documented logical names (no overrides). Overrides are a
    // sensible default only; the user owns this file and can drop or edit them.
    const alreadyWired = await packageIsAlreadyWired(
      addonDir,
      packageName,
      readdir,
      readFile
    )
    const overrides = alreadyWired
      ? deriveInstanceOverrides(
          namespace,
          packageName,
          await readAddonDeclaredNames(rootDir, packageName)
        )
      : {}

    // Import via the project's `#pikku` subpath alias, not a computed relative
    // path: every pikku project defines `#pikku/*`, and it resolves to the
    // generated types regardless of where the addon wiring physically sits (a
    // relative guess breaks the moment scaffold.pikkuDir and the real .pikku
    // location diverge).
    const wiringContent = `import { wireAddon } from '#pikku/pikku-types.gen.js'

wireAddon(${serializeWireAddon(namespace, packageName, overrides)})
`
    await writeFile(wiringFile, wiringContent, 'utf-8')

    return {
      success: true,
      message: `Installed ${packageName} and created ${wiringFile}`,
    }
  },
})

/** True if any existing `*.addon.ts` in the addons dir already wires this
 *  package — i.e. this install is a second-or-later instance. */
async function packageIsAlreadyWired(
  addonDir: string,
  packageName: string,
  readdir: (typeof import('node:fs/promises'))['readdir'],
  readFile: (typeof import('node:fs/promises'))['readFile']
): Promise<boolean> {
  let entries: string[]
  try {
    entries = await readdir(addonDir)
  } catch {
    return false
  }
  for (const entry of entries) {
    if (!entry.endsWith('.addon.ts')) continue
    const content = await readFile(`${addonDir}/${entry}`, 'utf-8').catch(
      () => ''
    )
    // Match `package: 'x'` / `package: "x"` for this exact package name.
    if (
      new RegExp(
        `package:\\s*['"]${packageName.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')}['"]`
      ).test(content)
    ) {
      return true
    }
  }
  return false
}

/** Serialize the `wireAddon({...})` argument. A plain instance stays a compact
 *  one-liner; an instance with overrides expands to a readable multi-line form. */
function serializeWireAddon(
  namespace: string,
  packageName: string,
  overrides: InstanceOverrides
): string {
  const maps = Object.entries(overrides).filter(
    ([, m]) => m && Object.keys(m).length > 0
  ) as [string, Record<string, string>][]
  if (maps.length === 0) {
    return `{ name: '${namespace}', package: '${packageName}' }`
  }
  const lines = [
    `{`,
    `  name: '${namespace}',`,
    `  package: '${packageName}',`,
    ...maps.map(([kind, map]) => {
      const pairs = Object.entries(map)
        .map(([k, v]) => `'${k}': '${v}'`)
        .join(', ')
      return `  ${kind}: { ${pairs} },`
    }),
    `}`,
  ]
  return lines.join('\n')
}
