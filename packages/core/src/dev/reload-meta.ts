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
 * Re-reads the codegen output (wiring meta + JSON schemas) into the running
 * process so new and changed functions become callable without a server
 * restart. The generated `*-meta.gen.ts` files are plain
 * `pikkuState(area, key, <json>)` side effects, but they cannot be
 * re-imported after a dev-time codegen — the ESM cache pins both the wrapper
 * and its JSON import — so this reads the JSON sources directly and applies
 * the same state.
 *
 * Meant to be called by a dev-server watcher after each codegen pass. Routes
 * registered by NEW `wireHTTP` files are not picked up (their modules were
 * never imported); those still need a restart.
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
  // Merge over the existing map, don't replace it: framework internals like
  // pikkuWorkflowOrchestrator / the per-workflow queue workers are registered
  // at service-init (pikku-workflow-service.ts), never in the generated JSON —
  // a wholesale replace drops them and workflow jobs then fail with
  // "Function meta not found: pikkuWorkflowOrchestrator".
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
  // Same reason as function meta: the workflow service adds its orchestrator /
  // step queues (and wf-orchestrator-* / wf-step-* per-workflow queues) here at
  // init, absent from the generated JSON — merge so they survive the reload.
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

  // Generated JSON schemas: <outDir>/schemas/schemas/<Name>.schema.json.
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
