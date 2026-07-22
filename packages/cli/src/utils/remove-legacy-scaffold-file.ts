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

export const pruneLegacyScaffoldFiles = async (config: PikkuCLIConfig) => {
  for (const file of scaffoldFiles(config)) {
    if (file) {
      await removeLegacyScaffoldFile(file)
    }
  }
}
