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
import { validateAndBuildSecretDefinitionsMeta } from '@pikku/core/secret'

const loadIcon = async (
  iconPath: string | undefined,
  rootDir: string,
  logger: any
): Promise<string | undefined> => {
  if (!iconPath) return undefined

  const fullPath = isAbsolute(iconPath) ? iconPath : join(rootDir, iconPath)

  try {
    const content = await readFile(fullPath, 'utf-8')

    const trimmed = content.trim()
    if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) {
      logger.warn(`Icon file is not a valid SVG: ${fullPath}`)
      return undefined
    }

    return trimmed.replace(/<\?xml[^?]*\?>\s*/g, '').trim()
  } catch {
    logger.warn(`Could not load icon: ${fullPath}`)
    return undefined
  }
}

export const pikkuNodesMeta = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { nodes, secrets } = state
    const { nodesMetaJsonFile, node, rootDir } = config

    const secretsMeta = validateAndBuildSecretDefinitionsMeta(
      secrets.definitions,
      state.schemaLookup
    )

    const hasNodes = Object.keys(nodes.meta).length > 0
    const hasSecrets = secrets.definitions.length > 0

    if (!hasNodes && !hasSecrets) {
      return undefined
    }

    const allowedCategories = node?.categories
    if (allowedCategories && allowedCategories.length > 0) {
      for (const [name, meta] of Object.entries(nodes.meta) as [
        string,
        any,
      ][]) {
        if (!allowedCategories.includes(meta.category)) {
          logger.critical(
            ErrorCode.INVALID_VALUE,
            `Node '${name}' has invalid category '${meta.category}'. ` +
              `Allowed categories: ${allowedCategories.join(', ')}`
          )
        }
      }
    }

    const outputMeta: Record<string, any> = {}
    for (const [name, meta] of Object.entries(nodes.meta) as [string, any][]) {
      const { icon: _icon, ...nodeMetaWithoutIcon } = meta
      outputMeta[name] = nodeMetaWithoutIcon
    }

    const packageIcon = await loadIcon(node?.icon, rootDir, logger)

    const metaData = {
      nodes: outputMeta,
      secrets: secretsMeta,
      package: {
        displayName: node?.displayName,
        description: node?.description,
        icon: packageIcon,
        categories: node?.categories,
      },
    }

    if (nodesMetaJsonFile) {
      const minimalMeta = stripVerboseFields(metaData)
      await writeFileInDir(
        logger,
        nodesMetaJsonFile,
        JSON.stringify(minimalMeta, null, 2),
        { ignoreModifyComment: true }
      )

      if (hasVerboseFields(metaData)) {
        const verbosePath = nodesMetaJsonFile.replace(
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
      commandStart: 'Generating nodes metadata',
      commandEnd: 'Generated nodes metadata',
    }),
  ],
})
