import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { readFile } from 'fs/promises'
import { join, isAbsolute } from 'path'
import { pathToFileURL } from 'url'
import type { ForgeCredentialMeta } from '@pikku/core/forge-node'
import { zodToJsonSchema } from 'zod-to-json-schema'

/**
 * Convert Zod schema to JSON Schema.
 */
const convertCredentialSchema = async (
  meta: ForgeCredentialMeta & {
    schema: { _schemaVariableName?: string; _sourceFile?: string }
  },
  logger: any
): Promise<ForgeCredentialMeta> => {
  const { schema } = meta
  const schemaVariableName = schema._schemaVariableName
  const sourceFile = schema._sourceFile

  if (!schemaVariableName || !sourceFile) {
    logger.warn(
      `Credential '${meta.name}' has invalid schema reference, skipping JSON Schema conversion`
    )
    return {
      ...meta,
      schema: {},
    }
  }

  try {
    // Convert source file path to a compiled JS path
    // TypeScript typically compiles src/ to dist/src/ (preserving structure)
    // Source: /path/to/src/functions/file.ts
    // Compiled: /path/to/dist/src/functions/file.js
    const compiledPath = sourceFile
      .replace(/\/src\//, '/dist/src/')
      .replace(/\.ts$/, '.js')

    // Import the compiled module to get the Zod schema
    const fileUrl = pathToFileURL(compiledPath).href
    const module = await import(fileUrl)

    const zodSchema = module[schemaVariableName]
    if (!zodSchema) {
      logger.warn(
        `Could not find exported schema '${schemaVariableName}' in ${compiledPath}`
      )
      return {
        ...meta,
        schema: {},
      }
    }

    // Convert Zod schema to JSON Schema
    const jsonSchema = zodToJsonSchema(zodSchema, {
      $refStrategy: 'none',
      target: 'jsonSchema7',
    })

    // Remove $schema key from output
    const { $schema, ...schemaWithoutMeta } = jsonSchema as Record<
      string,
      unknown
    >

    return {
      ...meta,
      schema: schemaWithoutMeta,
    }
  } catch (e) {
    logger.warn(
      `Could not convert schema for credential '${meta.name}': ${e instanceof Error ? e.message : e}`
    )
    return {
      ...meta,
      schema: {},
    }
  }
}

/**
 * Load and sanitize an SVG icon file.
 * Returns the SVG content as a string, or undefined if not found.
 */
const loadIcon = async (
  iconPath: string | undefined,
  rootDir: string,
  logger: any
): Promise<string | undefined> => {
  if (!iconPath) return undefined

  // Resolve the full path to the icon
  const fullPath = isAbsolute(iconPath) ? iconPath : join(rootDir, iconPath)

  try {
    const content = await readFile(fullPath, 'utf-8')

    // Basic SVG validation - must start with <svg
    const trimmed = content.trim()
    if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) {
      logger.warn(`Icon file is not a valid SVG: ${fullPath}`)
      return undefined
    }

    // Return the sanitized SVG (remove XML declaration if present)
    return trimmed.replace(/<\?xml[^?]*\?>\s*/g, '').trim()
  } catch (e) {
    logger.warn(`Could not load icon: ${fullPath}`)
    return undefined
  }
}

export const pikkuForgeNodes: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const { forgeNodes, forgeCredentials } = await getInspectorState()
    const { forgeNodesMetaJsonFile, forge, rootDir } = config

    const hasNodes = Object.keys(forgeNodes.meta).length > 0
    const hasCredentials = Object.keys(forgeCredentials.meta).length > 0

    // Only generate if there are forge nodes or credentials
    if (!hasNodes && !hasCredentials) {
      return undefined
    }

    // Validate categories if configured
    const allowedCategories = forge?.node?.categories
    if (allowedCategories && allowedCategories.length > 0) {
      for (const [name, meta] of Object.entries(forgeNodes.meta) as [
        string,
        any,
      ][]) {
        if (!allowedCategories.includes(meta.category)) {
          logger.critical(
            ErrorCode.INVALID_VALUE,
            `Forge node '${name}' has invalid category '${meta.category}'. ` +
              `Allowed categories: ${allowedCategories.join(', ')}`
          )
        }
      }
    }

    // Build the output metadata - remove per-node icon field
    const outputMeta: Record<string, any> = {}
    for (const [name, meta] of Object.entries(forgeNodes.meta) as [
      string,
      any,
    ][]) {
      // Remove icon from node meta - only package-level icon is used
      const { icon: _icon, ...nodeMetaWithoutIcon } = meta
      outputMeta[name] = nodeMetaWithoutIcon
    }

    // Load package-level icon
    const packageIcon = await loadIcon(forge?.node?.icon, rootDir, logger)

    // Process credentials - convert Zod schemas to JSON Schema
    const outputCredentials: Record<string, ForgeCredentialMeta> = {}
    for (const [name, meta] of Object.entries(forgeCredentials.meta) as [
      string,
      any,
    ][]) {
      outputCredentials[name] = await convertCredentialSchema(meta, logger)
    }

    const metaData = {
      nodes: outputMeta,
      credentials: outputCredentials,
      package: {
        displayName: forge?.node?.displayName,
        description: forge?.node?.description,
        icon: packageIcon,
        categories: forge?.node?.categories,
      },
    }

    if (forgeNodesMetaJsonFile) {
      await writeFileInDir(
        logger,
        forgeNodesMetaJsonFile,
        JSON.stringify(metaData, null, 2),
        { ignoreModifyComment: true }
      )
    }

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Forge nodes metadata',
      commandEnd: 'Generated Forge nodes metadata',
    }),
  ],
})
