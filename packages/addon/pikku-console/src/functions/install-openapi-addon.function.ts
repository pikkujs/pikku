import { pikkuSessionlessFunc } from '#pikku'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pikkuState } from '@pikku/core/internal'

export const installOpenapiAddon = pikkuSessionlessFunc<
  {
    name: string
    swaggerUrl: string
    credential?: 'apikey' | 'bearer' | 'oauth2'
  },
  { success: boolean; message: string }
>({
  title: 'Install OpenAPI Addon',
  description:
    'Generates an addon from an OpenAPI spec, installs it into the workspace, and wires it up.',
  expose: true,
  auth: false,
  func: async (_services, { name, swaggerUrl, credential }) => {
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

    const addonDir = config.scaffold?.addonDir
    if (!addonDir) {
      throw new Error('scaffold.addonDir not configured in pikku.config.json')
    }

    const targetDir = join(rootDir, addonDir)
    const addonPath = join(targetDir, name)
    if (existsSync(addonPath)) {
      throw new Error(`Addon directory already exists: ${addonPath}`)
    }

    const args = [
      `--name ${name}`,
      `--openapi ${swaggerUrl}`,
      `--dir ${targetDir}`,
    ]
    if (credential) {
      args.push(`--credential ${credential}`)
    }

    execSync(`npx pikku create addon ${args.join(' ')}`, {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 120_000,
    })

    const pmLock: Record<string, string> = {
      'yarn.lock': 'yarn',
      'pnpm-lock.yaml': 'pnpm',
      'package-lock.json': 'npm',
      'bun.lockb': 'bun',
    }
    let pm = 'yarn'
    for (const [lock, pmName] of Object.entries(pmLock)) {
      if (existsSync(join(rootDir, lock))) {
        pm = pmName
        break
      }
    }

    execSync(`${pm} install`, {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 120_000,
    })

    return {
      success: true,
      message: `Generated addon "${name}" from OpenAPI spec and installed dependencies`,
    }
  },
})
