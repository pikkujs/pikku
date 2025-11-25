import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { readFile } from 'fs/promises'
import { join, isAbsolute } from 'path'

/**
 * Load and sanitize an SVG icon file.
 * Returns the SVG content as a string, or undefined if not found.
 */
const loadIcon = async (
  iconPath: string | undefined,
  iconsDir: string | undefined,
  rootDir: string,
  logger: any
): Promise<string | undefined> => {
  if (!iconPath) return undefined

  // Determine the full path to the icon
  let fullPath: string
  if (isAbsolute(iconPath)) {
    fullPath = iconPath
  } else if (iconsDir) {
    const resolvedIconsDir = isAbsolute(iconsDir)
      ? iconsDir
      : join(rootDir, iconsDir)
    fullPath = join(resolvedIconsDir, iconPath)
  } else {
    fullPath = join(rootDir, iconPath)
  }

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
    const { forgeNodes } = await getInspectorState()
    const { forgeNodesMetaJsonFile, forge, rootDir } = config

    // Only generate if there are forge nodes
    if (Object.keys(forgeNodes.meta).length === 0) {
      return undefined
    }

    const iconsDir = forge?.node?.iconsDir

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

    // Build the output metadata with package-level defaults and loaded icons
    const outputMeta: Record<string, any> = {}
    for (const [name, meta] of Object.entries(forgeNodes.meta) as [
      string,
      any,
    ][]) {
      // Determine icon path (node-level or package-level default)
      const iconPath = meta.icon || forge?.node?.icon

      // Load and inline the SVG content
      const iconContent = await loadIcon(iconPath, iconsDir, rootDir, logger)

      outputMeta[name] = {
        ...meta,
        icon: iconContent,
      }
    }

    // Load package-level icon if specified
    const packageIcon = await loadIcon(
      forge?.node?.icon,
      iconsDir,
      rootDir,
      logger
    )

    const metaData = {
      nodes: outputMeta,
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
