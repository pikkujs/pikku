import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { PikkuCLIConfig } from '../../types/config.js'

/**
 * Every generated file a scaffold owns, including the ones derived from a
 * sibling rather than configured directly.
 */
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

/**
 * Delete the pre-directory copy of a scaffold file.
 *
 * Scaffolds used to be emitted flat into the scaffold dir (`scaffold/rpc-public.gen.ts`)
 * and now live in a directory per domain (`scaffold/rpc/rpc-public.gen.ts`). The
 * old file is still valid TypeScript wiring the same routes, so leaving it
 * behind wires everything twice and codegen fails with PKU851 rather than
 * silently picking one.
 *
 * `file` is the *new* path; the legacy path is its basename one directory up.
 */
export const removeLegacyScaffoldFile = async (file: string) => {
  const legacy = join(dirname(dirname(file)), basename(file))
  if (legacy !== file && existsSync(legacy)) {
    await rm(legacy, { force: true })
  }
}

/**
 * Prune every scaffold's legacy copy in one pass, before anything inspects the
 * source tree.
 *
 * The per-command cleanup runs after that command has written its file, which
 * is too late for the diagnostics gate: inspection has already seen both copies
 * and failed the run with PKU851. Upgrading a project would then need two
 * codegen runs, the first one red.
 */
export const pruneLegacyScaffoldFiles = async (config: PikkuCLIConfig) => {
  for (const file of scaffoldFiles(config)) {
    if (file) {
      await removeLegacyScaffoldFile(file)
    }
  }
}
