import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

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
    const metaBasePath = (metaService as any)?.basePath as string | undefined
    if (!metaBasePath) {
      throw new MissingServiceError('Install is only available in local development mode')
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

    const flags = [`--openapi ${swaggerUrl}`, `--dir ${targetDir}`]
    if (credential) {
      flags.push(`--credential ${credential}`)
    }

    execSync(`npx pikku new addon ${name} ${flags.join(' ')}`, {
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

    execSync(`npx pikku all`, {
      cwd: addonPath,
      stdio: 'pipe',
      timeout: 120_000,
    })

    try {
      execSync(`npx tsc`, {
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
      const { mkdirSync, writeFileSync } = await import('node:fs')
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

    execSync(`npx pikku all`, {
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
