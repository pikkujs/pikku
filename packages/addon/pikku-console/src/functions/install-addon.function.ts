import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

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
    const validPkg = /^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/
    if (!validPkg.test(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`)
    }
    if (!/^[a-z0-9-]+$/.test(namespace)) {
      throw new Error(`Invalid namespace: ${namespace}`)
    }
    if (version && !/^[a-z0-9._^~><=|-]+$/i.test(version)) {
      throw new Error(`Invalid version: ${version}`)
    }

    const metaBasePath = metaService?.basePath
    if (!metaBasePath) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    const rootDir = dirname(metaBasePath)

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
      throw new Error(`Addon wiring file already exists: ${wiringFile}`)
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

    execFileSync(pm, installArgs[pm]!, { cwd: rootDir, stdio: 'pipe' })

    const typesImport = config.scaffold?.pikkuDir
      ? `../${config.scaffold.pikkuDir.split('/').pop()}/pikku-types.gen.js`
      : '../../.pikku/pikku-types.gen.js'

    const wiringContent = `import { wireAddon } from '${typesImport}'

wireAddon({ name: '${namespace}', package: '${packageName}' })
`
    await writeFile(wiringFile, wiringContent, 'utf-8')

    return {
      success: true,
      message: `Installed ${packageName} and created ${wiringFile}`,
    }
  },
})
