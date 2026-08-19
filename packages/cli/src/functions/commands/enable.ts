import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { pikkuVoidFunc } from '#pikku/function'
import type { PikkuScaffoldFeature } from '../../../types/config.js'

type SurfaceFeature =
  | 'rpc'
  | 'console'
  | 'scenarios'
  | 'agent'
  | 'workflow'
  | 'events'
  | 'remoteRpc'

type WorkerFeature = 'webhook'

type Feature = SurfaceFeature | WorkerFeature

async function enableFeature(
  feature: Feature,
  logger: { info: (msg: string) => void },
  config: { configDir: string }
) {
  const configPath = join(config.configDir, 'pikku.config.json')
  const raw = await readFile(configPath, 'utf-8')
  const json = JSON.parse(raw)

  if (!json.scaffold) {
    json.scaffold = {}
  }

  if (!json.scaffold.pikkuDir) {
    json.scaffold.pikkuDir = 'pikku'
  }

  const value: PikkuScaffoldFeature = true

  json.scaffold[feature] = value

  await writeFile(configPath, JSON.stringify(json, null, 2) + '\n', 'utf-8')
  logger.info(
    `Enabled scaffold.${feature} = ${JSON.stringify(value)} in ${configPath}`
  )
}

export const enableRpc = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('rpc', logger, config),
})

export const enableConsole = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('console', logger, config),
})

export const enableScenarios = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('scenarios', logger, config),
})

export const enableAgent = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('agent', logger, config),
})

export const enableWorkflow = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('workflow', logger, config),
})

export const enableEvents = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('events', logger, config),
})

export const enableRemoteRpc = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('remoteRpc', logger, config),
})

export const enableWebhook = pikkuVoidFunc({
  func: async ({ logger, config }) =>
    enableFeature('webhook', logger, config),
})
