import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { PikkuCLIConfig } from '../../types/config.js'

const scaffoldFiles = (config: PikkuCLIConfig): (string | undefined)[] => {
  const authDir = config.authFile ? dirname(config.authFile) : undefined
  return [
    config.graphWiringsFile,
    config.webhookWorkersFile,
    config.webhookSchemasFile,
    config.workflowRoutesFile,
    config.workflowRoutesSchemasFile,
    config.publicRpcFile,
    config.publicRpcSchemasFile,
    config.remoteRpcWorkersFile,
    config.remoteRpcSchemasFile,
    config.publicAgentFile,
    config.publicAgentSchemasFile,
    config.consoleFunctionsFile,
    config.consoleSchemasFile,
    config.scenariosFunctionsFile,
    config.scenariosSchemasFile,
    config.userAdminFunctionsFile,
    config.userAdminSchemasFile,
    config.eventsChannelFile,
    config.eventsSchemasFile,
    config.authFile,
    authDir ? join(authDir, 'auth-secrets.gen.ts') : undefined,
    authDir ? join(authDir, 'auth-middleware.gen.ts') : undefined,
  ]
}

export const removeLegacyScaffoldFile = async (file: string) => {
  const legacy = join(dirname(dirname(file)), basename(file))
  if (legacy !== file && existsSync(legacy)) {
    await rm(legacy, { force: true })
  }
}

/**
 * Delete scaffolds pikku has stopped generating.
 *
 * The scenario instrumentation scaffold is why this exists: those four functions
 * are pikku's own and are now registered by `pikku dev` itself, because as project
 * source they were indistinguishable from application code and shipped —
 * `expose: true` — in every deployed bundle. The inspector ignores them by name so
 * an unregenerated project is already safe, but the file is then dead code that
 * still imports `zod`, so it goes.
 *
 * Unlike `pruneLegacyScaffoldFiles`, which removes a file from a path pikku used
 * to write to, this removes a file pikku no longer writes at all.
 */
export const removeRetiredScaffoldFiles = async (config: PikkuCLIConfig) => {
  for (const file of [
    config.scenariosFunctionsFile,
    config.scenariosSchemasFile,
  ]) {
    if (file && existsSync(file)) {
      await rm(file, { force: true })
    }
  }
}

export const pruneLegacyScaffoldFiles = async (config: PikkuCLIConfig) => {
  for (const file of scaffoldFiles(config)) {
    if (file) {
      await removeLegacyScaffoldFile(file)
    }
  }
}
