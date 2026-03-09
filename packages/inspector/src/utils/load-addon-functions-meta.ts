import { readFile, readdir } from 'fs/promises'
import { createRequire } from 'module'
import { join, dirname } from 'path'
import type { InspectorState, InspectorLogger } from '../types.js'

/**
 * After the setup sweep discovers wireAddon() declarations, load each addon
 * package's function metadata so that wiring handlers (channels, HTTP routes,
 * schedules, etc.) can look up addon function types during the routes sweep.
 * Also loads addon schemas into state.schemas so CLI options can derive choices.
 */
export async function loadAddonFunctionsMeta(
  logger: InspectorLogger,
  state: InspectorState
): Promise<void> {
  const { wireAddonDeclarations } = state.rpc
  if (wireAddonDeclarations.size === 0) return

  const require = createRequire(join(state.rootDir, 'package.json'))

  for (const [namespace, decl] of wireAddonDeclarations) {
    try {
      const metaPath = require.resolve(
        `${decl.package}/.pikku/function/pikku-functions-meta.gen.json`
      )
      const raw = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(raw)
      state.addonFunctions[namespace] = meta
      logger.debug(
        `Loaded ${Object.keys(meta).length} addon functions for '${namespace}' from ${decl.package}`
      )

      // If wireAddon has mcp: true, expose addon functions with mcp: true as MCP tools
      if (decl.mcp) {
        for (const [funcName, funcMeta] of Object.entries<any>(meta)) {
          if (funcMeta.mcp) {
            const toolName = `${namespace}:${funcName}`
            state.mcpEndpoints.toolsMeta[toolName] = {
              pikkuFuncId: `${namespace}:${funcName}`,
              name: toolName,
              description: funcMeta.description || funcMeta.title || funcName,
              inputSchema: funcMeta.inputSchemaName ?? null,
              outputSchema: funcMeta.outputSchemaName ?? null,
              tags: funcMeta.tags,
            }
          }
        }
      }

      // Load addon schemas into state.schemas
      const schemasDir = join(dirname(metaPath), '..', 'schemas', 'schemas')
      try {
        const schemaFiles = await readdir(schemasDir)
        for (const file of schemaFiles) {
          if (!file.endsWith('.schema.json')) continue
          const schemaName = file.replace('.schema.json', '')
          if (!state.schemas[schemaName]) {
            const schemaRaw = await readFile(join(schemasDir, file), 'utf-8')
            state.schemas[schemaName] = JSON.parse(schemaRaw)
          }
        }
      } catch {
        // No schemas directory — that's fine
      }
    } catch (error: any) {
      logger.warn(
        `Failed to load addon function metadata for '${namespace}' (${decl.package}): ${error.message}`
      )
    }
  }
}
