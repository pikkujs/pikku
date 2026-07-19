import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { pikkuVoidFunc } from '#pikku'
import type { PikkuScaffoldFeature } from '../../../types/config.js'

/** Features that scaffold a surface, and so have an auth dimension. */
type AuthFeature =
  | 'rpc'
  | 'console'
  | 'scenarios'
  | 'agent'
  | 'workflow'
  | 'events'
  | 'remoteRpc'

/** Features that are simply on or off — no endpoint, nothing to authenticate. */
type BooleanFeature = 'webhook'

type Feature = AuthFeature | BooleanFeature

const FEATURE_DEFAULTS: Record<AuthFeature, 'auth' | 'no-auth'> = {
  rpc: 'auth',
  agent: 'auth',
  console: 'auth',
  scenarios: 'auth',
  workflow: 'auth',
  events: 'auth',
  remoteRpc: 'no-auth',
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

  // The console is an admin surface — every RPC requires a session, so it can
  // never be scaffolded no-auth (the --no-auth flag is ignored for it).
  const value: PikkuScaffoldFeature | true =
    feature === 'webhook'
      ? true
      : feature === 'console'
        ? 'auth'
        : noAuth
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

export const enableScenarios = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('scenarios', logger, config, data),
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

export const enableRemoteRpc = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('remoteRpc', logger, config, data),
})

export const enableWebhook = pikkuVoidFunc({
  func: async ({ logger, config }, data: any) =>
    enableFeature('webhook', logger, config, data),
})
