import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTypedRPCMap } from './serialize-typed-rpc-map.js'

export const pikkuRPCInternalMap: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const { rpcInternalMapDeclarationFile, packageMappings } = config

    const content = serializeTypedRPCMap(
      rpcInternalMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      functions.meta,
      rpc.internalMeta
    )
    await writeFileInDir(logger, rpcInternalMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating RPC internal map',
      commandEnd: 'Created RPC internal map',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})

export const pikkuRPCExposedMap: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const { rpcMapDeclarationFile, packageMappings } = config

    const content = serializeTypedRPCMap(
      rpcMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      functions.meta,
      rpc.exposedMeta
    )
    await writeFileInDir(logger, rpcMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating RPC external map',
      commandEnd: 'Created RPC external map',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
