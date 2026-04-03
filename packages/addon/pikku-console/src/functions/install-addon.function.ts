import { pikkuSessionlessFunc } from '#pikku'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pikkuState } from '@pikku/core/internal'

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
  func: async (_services, { packageName, namespace, version }) => {
    const metaDir = pikkuState(null, 'package', 'metaDir') ?? ''
    if (!metaDir) {
      throw new Error('Install is only available in local development mode')
    }
    const rootDir = dirname(metaDir)

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

    const installCmd: Record<string, string> = {
      yarn: `yarn add ${pkg}`,
      npm: `npm install ${pkg}`,
      pnpm: `pnpm add ${pkg}`,
      bun: `bun add ${pkg}`,
    }

    execSync(installCmd[pm]!, { cwd: rootDir, stdio: 'pipe' })

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
