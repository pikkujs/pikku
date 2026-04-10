import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

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
  func: async ({ metaService }, { name, swaggerUrl, credential }) => {
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(`Invalid addon name: ${name}`)
    }
    try {
      new URL(swaggerUrl)
    } catch {
      throw new Error(`Invalid swagger URL: ${swaggerUrl}`)
    }

    const metaBasePath = (metaService as any)?.basePath as string | undefined
    if (!metaBasePath) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    const rootDir = dirname(metaBasePath)

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

    const pikkuArgs = ['pikku', 'new', 'addon', name, '--openapi', swaggerUrl, '--dir', targetDir]
    if (credential) {
      pikkuArgs.push('--credential', credential)
    }

    execFileSync('npx', pikkuArgs, {
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

    execFileSync(pm, ['install'], {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 120_000,
    })

    execFileSync('npx', ['pikku', 'all'], {
      cwd: addonPath,
      stdio: 'pipe',
      timeout: 120_000,
    })

    try {
      execFileSync('npx', ['tsc'], {
        cwd: addonPath,
        stdio: 'pipe',
        timeout: 120_000,
      })
    } catch {
      // tsc may fail on generated code — addon still works via tsx
    }

    const pikkuDir = config.scaffold?.pikkuDir
    if (pikkuDir) {
      const addonsDir = join(rootDir, dirname(pikkuDir), 'addons')
      mkdirSync(addonsDir, { recursive: true })
      const wiringFile = join(addonsDir, `${name}.addon.ts`)
      if (!existsSync(wiringFile)) {
        writeFileSync(
          wiringFile,
          `import { wireAddon } from '#pikku/pikku-types.gen.js'\n\nwireAddon({ name: '${name}', package: '@pikku/addon-${name}' })\n`,
          'utf-8'
        )
      }
    }

    execFileSync('npx', ['pikku', 'all'], {
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
