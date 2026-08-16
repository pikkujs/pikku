import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeGatewayTypes } from './serialize-gateway-types.js'

export const pikkuGatewayTypes = pikkuSessionlessFunc<
  { bootstrap?: boolean },
  void
>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { gatewaysTypesFile, packageMappings } = config
    const visitState = await getInspectorState(
      false,
      true,
      data?.bootstrap ?? false
    )

    const { singletonServicesType } = visitState.filesAndMethods

    if (!singletonServicesType) {
      throw new Error('SingletonServices type not found')
    }

    const singletonServicesTypeImport = `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(gatewaysTypesFile, singletonServicesType.typePath, packageMappings)}'`

    const content = serializeGatewayTypes(
      singletonServicesTypeImport,
      singletonServicesType.type
    )
    await writeFileInDir(logger, gatewaysTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating gateway types',
      commandEnd: 'Created gateway types',
    }),
  ],
})
