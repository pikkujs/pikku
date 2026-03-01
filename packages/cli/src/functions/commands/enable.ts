import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { pikkuVoidFunc } from '#pikku'
import type { PikkuScaffoldFeature } from '../../../types/config.js'

type Feature = 'rpc' | 'console' | 'agent' | 'workflow'

const FEATURE_DEFAULTS: Record<Feature, 'auth' | 'no-auth'> = {
  rpc: 'auth',
  agent: 'auth',
  console: 'no-auth',
  workflow: 'auth',
}

const createEnableCommand = (feature: Feature) =>
  pikkuVoidFunc({
    func: async ({ logger, config }, data: any) => {
      const noAuth = data?.['no-auth'] ?? false
      const configPath = join(config.configDir, 'pikku.config.json')
      const raw = await readFile(configPath, 'utf-8')
      const json = JSON.parse(raw)

      if (!json.scaffold) {
        json.scaffold = {}
      }

      if (!json.scaffold.pikkuDir) {
        json.scaffold.pikkuDir = 'pikku'
      }

      const value: PikkuScaffoldFeature = noAuth
        ? 'no-auth'
        : FEATURE_DEFAULTS[feature]
      json.scaffold[feature] = value

      await writeFile(configPath, JSON.stringify(json, null, 2) + '\n', 'utf-8')
      logger.info(`Enabled scaffold.${feature} = '${value}' in ${configPath}`)
    },
  })

export const enableRpc = createEnableCommand('rpc')
export const enableConsole = createEnableCommand('console')
export const enableAgent = createEnableCommand('agent')
export const enableWorkflow = createEnableCommand('workflow')
