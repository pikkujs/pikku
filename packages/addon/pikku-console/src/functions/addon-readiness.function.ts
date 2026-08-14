import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { BadRequestError, LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'
import { findProjectRoot } from '../lib/find-project-root.js'
import { readWiringOverrides } from '../lib/addon-readiness.js'

export const addonReadiness = pikkuFunc<
  { packageName: string; namespace: string },
  { ready: boolean; missingSecrets: string[]; missingVariables: string[] }
>({
  title: 'Addon Readiness',
  description:
    'Reports which of an installed addon instance secrets and variables are still unset. Requires an admin session.',
  expose: true,
  auth: true,
  scopes: ['pikku:console:addons:read'],
  func: async (
    { metaService, addonReadinessService },
    { packageName, namespace }
  ) => {
    if (!/^[a-z0-9-]+$/.test(namespace)) {
      throw new BadRequestError(`Invalid namespace: ${namespace}`)
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

    const wiringFile = join(
      rootDir,
      dirname(pikkuDir),
      'addons',
      `${namespace}.addon.ts`
    )
    const overrides = existsSync(wiringFile)
      ? await readWiringOverrides(wiringFile)
      : {}

    return addonReadinessService.check(rootDir, packageName, overrides)
  },
})
