import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { pikkuVoidFunc } from '#pikku/function'
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

/**
 * Remote RPC workers carry no auth dimension — `serialize-remote-rpc.ts`
 * hardcodes `auth: false` on what it generates — so enabling it writes a bare
 * `true` and there is nothing to opt out of.
 */
const NO_AUTH_DIMENSION: ReadonlySet<AuthFeature> = new Set(['remoteRpc'])

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

  // `true` is enabled AND authenticated. Only an explicit --no-auth writes the
  // object form, so a feature can never be turned on public by accident.
  //
  // The console is an admin surface — every RPC requires a session, so
  // --no-auth is ignored for it.
  const wantsPublic =
    noAuth &&
    feature !== 'console' &&
    !NO_AUTH_DIMENSION.has(feature as AuthFeature)

  const value: PikkuScaffoldFeature =
    feature === 'webhook' ? true : wantsPublic ? { auth: false } : true

  json.scaffold[feature] = value

  await writeFile(configPath, JSON.stringify(json, null, 2) + '\n', 'utf-8')
  logger.info(
    `Enabled scaffold.${feature} = ${JSON.stringify(value)} in ${configPath}` +
      (wantsPublic ? ' (public — no session required)' : '')
  )
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
