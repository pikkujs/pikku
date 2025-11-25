import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuForgeNodes: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const { forgeNodes } = await getInspectorState()
    const { forgeNodesMetaJsonFile, forge } = config

    // Only generate if there are forge nodes
    if (Object.keys(forgeNodes.meta).length === 0) {
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

    // Build the output metadata with package-level defaults
    const outputMeta: Record<string, any> = {}
    for (const [name, meta] of Object.entries(forgeNodes.meta) as [
      string,
      any,
    ][]) {
      outputMeta[name] = {
        ...meta,
        // Apply package-level icon if not set on the node
        icon: meta.icon || forge?.node?.icon || undefined,
      }
    }

    const metaData = {
      nodes: outputMeta,
      package: {
        displayName: forge?.node?.displayName,
        description: forge?.node?.description,
        icon: forge?.node?.icon,
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
