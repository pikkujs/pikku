import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { readFile } from 'fs/promises'
import { join, isAbsolute } from 'path'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

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
    const { forgeNodes, credentials } = await getInspectorState()
    const { forgeNodesMetaJsonFile, forge, rootDir } = config

    const hasNodes = Object.keys(forgeNodes.meta).length > 0
    const hasCredentials = Object.keys(credentials.meta).length > 0

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

    const metaData = {
      nodes: outputMeta,
      credentials: credentials.meta,
      package: {
        displayName: forge?.node?.displayName,
        description: forge?.node?.description,
        icon: packageIcon,
        categories: forge?.node?.categories,
      },
    }

    if (forgeNodesMetaJsonFile) {
      // Write minimal JSON (runtime-only fields)
      const minimalMeta = stripVerboseFields(metaData)
      await writeFileInDir(
        logger,
        forgeNodesMetaJsonFile,
        JSON.stringify(minimalMeta, null, 2),
        { ignoreModifyComment: true }
      )

      // Write verbose JSON only if it has additional fields
      if (hasVerboseFields(metaData)) {
        const verbosePath = forgeNodesMetaJsonFile.replace(
          /\.gen\.json$/,
          '-verbose.gen.json'
        )
        await writeFileInDir(
          logger,
          verbosePath,
          JSON.stringify(metaData, null, 2),
          { ignoreModifyComment: true }
        )
      }
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
