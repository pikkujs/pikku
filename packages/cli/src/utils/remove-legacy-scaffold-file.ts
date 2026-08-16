import { rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
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

/**
 * Entry points a scaffold may still import that nothing resolves any more:
 * the two #596 renamed, the `@pikku/core/ecosystem` tier #1308 deleted, and
 * the `#pikku` hub #1308 replaced with per-wiring leaves. The hub was the
 * project's own file, so a scaffold names it by a relative path rather than by
 * package — matching on the file name is what catches it wherever `outDir` sits.
 */
const REMOVED_ENTRY_POINTS = [
  '@pikku/core/ai-agent',
  '@pikku/core/ai-scorer',
  '@pikku/core/ecosystem',
  'pikku-types.gen.js',
]

/**
 * Delete agent scaffolds that import an entry point pikku no longer publishes.
 *
 * A scaffold is written once, when missing, and left alone afterwards so a
 * project can edit it. That is the right default until the import at the top
 * stops resolving: the file then fails to compile and pikku will not replace it,
 * because it is still there. Deleting it puts it back in the missing set, so the
 * same `pikku all` regenerates it against the current entry point.
 *
 * Only the specifiers above count as stale. Anything a
 * project added to the file is lost with it — which is why this is keyed to an
 * import that cannot compile rather than to the file simply being out of date.
 */
export const refreshScaffoldsImportingRemovedEntryPoints = async (
  config: PikkuCLIConfig
) => {
  for (const file of [config.publicAgentFile, config.publicAgentSchemasFile]) {
    if (!file || !existsSync(file)) continue
    const contents = readFileSync(file, 'utf-8')
    if (REMOVED_ENTRY_POINTS.some((entry) => contents.includes(entry))) {
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
