import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { pikkuState } from '../pikku-state.js'
import { addSchema, compileAllSchemas } from '../schema.js'
import { clearMiddlewareCache } from '../middleware-runner.js'
import { clearPermissionsCache } from '../permissions.js'
import { clearChannelMiddlewareCache } from '../wirings/channel/channel-middleware-runner.js'
import { httpRouter } from '../wirings/http/routers/http-router.js'
import type { Logger } from '../services/logger.js'
import type { SchemaService } from '../services/schema-service.js'

export interface ReloadGeneratedMetaOptions {
  /** The project's generated output directory (the CLI's resolved outDir). */
  pikkuDir: string
  logger: Logger
  /** Used to recompile validators for changed schemas; falls back to the
   *  schema service on the registered singleton services. */
  schemaService?: SchemaService
}

const readJson = async (
  logger: Logger,
  file: string
): Promise<any | undefined> => {
  let raw: string
  try {
    raw = await readFile(file, 'utf-8')
  } catch {
    // The project doesn't use this wiring type — nothing generated.
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    logger.error(
      `Hot-reload could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`
    )
    return undefined
  }
}

/**
 * Re-reads codegen output (wiring meta + JSON schemas) into the running
 * process, so new and changed functions become callable without a restart.
 * Called by a dev-server watcher after each codegen pass. Routes registered by
 * NEW `wireHTTP` files are not picked up — their modules were never imported.
 */
export async function reloadGeneratedMeta(
  options: ReloadGeneratedMetaOptions
): Promise<void> {
  const { pikkuDir, logger, schemaService } = options
  const dir = resolve(pikkuDir)

  const functionsMeta = await readJson(
    logger,
    join(dir, 'function/pikku-functions-meta.gen.json')
  )
  // knowledge: decisions/internals/core-hot-reload-merges-generated-meta-never-replaces-it.md
  if (functionsMeta) {
    const existing = pikkuState(null, 'function', 'meta') ?? {}
    pikkuState(null, 'function', 'meta', { ...existing, ...functionsMeta })
  }

  const httpMeta = await readJson(
    logger,
    join(dir, 'http/pikku-http-wirings-meta.gen.json')
  )
  if (httpMeta) pikkuState(null, 'http', 'meta', httpMeta)

  const rpcMeta = await readJson(
    logger,
    join(dir, 'rpc/pikku-rpc-wirings-meta.internal.gen.json')
  )
  if (rpcMeta) pikkuState(null, 'rpc', 'meta', rpcMeta)

  const queueMeta = await readJson(
    logger,
    join(dir, 'queue/pikku-queue-workers-wirings-meta.gen.json')
  )
  if (queueMeta) {
    const existing = pikkuState(null, 'queue', 'meta') ?? {}
    pikkuState(null, 'queue', 'meta', { ...existing, ...queueMeta })
  }

  const agentMeta = await readJson(
    logger,
    join(dir, 'agent/pikku-agent-wirings-meta.gen.json')
  )
  if (agentMeta?.agentsMeta) {
    pikkuState(null, 'agent', 'agentsMeta', agentMeta.agentsMeta)
  }

  // Re-adding replaces the map entry; the schema service recompiles any
  // validator whose stored schema value no longer matches.
  const schemasDir = join(dir, 'schemas', 'schemas')
  let schemaFiles: string[] = []
  try {
    schemaFiles = await readdir(schemasDir)
  } catch {
    // No generated schemas — a schema-less project.
  }
  for (const file of schemaFiles) {
    if (!file.endsWith('.schema.json')) continue
    const schema = await readJson(logger, join(schemasDir, file))
    if (schema) {
      addSchema(file.slice(0, -'.schema.json'.length), schema)
    }
  }

  clearMiddlewareCache()
  clearPermissionsCache()
  clearChannelMiddlewareCache()
  httpRouter.reset()

  try {
    compileAllSchemas(logger, schemaService)
  } catch (err) {
    logger.error(
      `Hot-reload schema recompilation failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Prunes the live addon registry to the namespaces the current source still
 * declares. Hot reload only re-imports files that exist, so a deleted
 * `*.addon.ts` otherwise leaves its `wireAddon` entry stranded until a restart.
 *
 * `declaredNamespaces` is `inspectorState.rpc.wireAddonDeclarations.keys()`.
 */
export function reconcileAddonRegistry(
  declaredNamespaces: Iterable<string>,
  logger?: Logger
): void {
  const declared = new Set(declaredNamespaces)
  const addons = pikkuState(null, 'addons', 'packages')
  for (const namespace of [...addons.keys()]) {
    if (!declared.has(namespace)) {
      addons.delete(namespace)
      logger?.info(`• Removed unwired addon "${namespace}"`)
    }
  }
}
