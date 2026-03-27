import { readFile, readdir } from 'fs/promises'
import { createRequire } from 'module'
import { join, dirname } from 'path'
import type { InspectorState, InspectorLogger } from '../types.js'

/**
 * After the setup sweep discovers wireAddon() declarations, load each addon
 * package's function metadata so that wiring handlers (channels, HTTP routes,
 * schedules, etc.) can look up addon function types during the routes sweep.
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
      // Load addon secrets meta
      try {
        const secretsMetaPath = require.resolve(
          `${decl.package}/.pikku/secrets/pikku-secrets-meta.gen.json`
        )
        const secretsRaw = await readFile(secretsMetaPath, 'utf-8')
        const secretsMeta = JSON.parse(secretsRaw)
        for (const [key, def] of Object.entries<any>(secretsMeta)) {
          const existing = state.secrets.definitions.find(
            (d: any) => d.name === key
          )
          if (!existing) {
            state.secrets.definitions.push(def)
            logger.debug(`Loaded addon secret '${key}' from ${decl.package}`)
          }
        }
      } catch {
        // No secrets meta — that's fine
      }

      // Load addon variables meta
      try {
        const variablesMetaPath = require.resolve(
          `${decl.package}/.pikku/variables/pikku-variables-meta.gen.json`
        )
        const variablesRaw = await readFile(variablesMetaPath, 'utf-8')
        const variablesMeta = JSON.parse(variablesRaw)
        for (const [key, def] of Object.entries<any>(variablesMeta)) {
          const existing = state.variables.definitions.find(
            (d: any) => d.name === key
          )
          if (!existing) {
            state.variables.definitions.push(def)
            logger.debug(`Loaded addon variable '${key}' from ${decl.package}`)
          }
        }
      } catch {
        // No variables meta — that's fine
      }
    } catch (error: any) {
      logger.warn(
        `Failed to load addon function metadata for '${namespace}' (${decl.package}): ${error.message}`
      )
    }
  }
}

/**
 * Load addon schemas into state.schemas. Called after generateAllSchemas
 * to ensure addon schemas aren't overwritten.
 */
export async function loadAddonSchemas(
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
        `Failed to load addon schemas for '${namespace}' (${decl.package}): ${error.message}`
      )
    }
  }
}
