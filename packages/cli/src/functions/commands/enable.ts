import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { pikkuVoidFunc } from '#pikku'
import type { PikkuScaffoldFeature } from '../../../types/config.js'

type Feature = 'rpc' | 'console' | 'agent' | 'workflow' | 'events'

const FEATURE_DEFAULTS: Record<Feature, 'auth' | 'no-auth'> = {
  rpc: 'auth',
  agent: 'auth',
  console: 'no-auth',
  workflow: 'auth',
  events: 'auth',
}

async function enableFeature(
  feature: Feature,
  logger: { info: (msg: string) => void },
  config: { configDir: string },
  data: any
) {
  const noAuth = data?.noAuth ?? false
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
}

export const enableRpc = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('rpc', logger, config, data),
})

export const enableConsole = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('console', logger, config, data),
})

export const enableAgent = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('agent', logger, config, data),
})

export const enableWorkflow = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('workflow', logger, config, data),
})

export const enableEvents = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('events', logger, config, data),
})
