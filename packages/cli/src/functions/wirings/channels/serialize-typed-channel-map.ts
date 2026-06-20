import type { ChannelsMeta } from '@pikku/core/channel'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type { TypesMap } from '@pikku/inspector'
import { generateCustomTypes, resolveFunctionMeta } from '@pikku/inspector'
import type { FunctionsMeta } from '@pikku/core'
import type { Logger } from '@pikku/core/services'

export const serializeTypedChannelsMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  addonFunctions: Record<string, FunctionsMeta>,
  channelsMeta: ChannelsMeta,
  rpcInternalMapDeclarationFile: string
): string => {
  const { channels, requiredTypes } = generateChannels(
    logger,
    typesMap,
    functionsMeta,
    addonFunctions,
    channelsMeta
  )
  typesMap.customTypes.forEach(({ references }) => {
    for (const reference of references) {
      if (reference !== '__object' && !reference.startsWith('__object_')) {
        requiredTypes.add(reference)
      }
    }
  })

  const needsFlattenedRPCMap = Array.from(requiredTypes).some((t) =>
    t.includes('FlattenedRPCMap')
  )
  if (needsFlattenedRPCMap) {
    for (const t of Array.from(requiredTypes)) {
      if (t.includes('FlattenedRPCMap')) {
        requiredTypes.delete(t)
      }
    }
  }

  const imports = serializeImportMap(
    logger,
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes
  )
  const rpcMapImport = needsFlattenedRPCMap
    ? `import type { FlattenedRPCMap } from '${getFileImportRelativePath(relativeToPath, rpcInternalMapDeclarationFile, packageMappings)}'`
    : ''
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)

  return `/**
 * This provides the structure needed for TypeScript to be aware of channels
 */

${imports}
${rpcMapImport}
${serializedCustomTypes}

interface ChannelHandler<I, O> {
    input: I;
    output: O;
}

${channels}

export type ChannelDefaultHandlerOf<Channel extends keyof ChannelsMap> =
    ChannelsMap[Channel]['defaultMessage'] extends { input: infer I; output: infer O }
        ? ChannelHandler<I, O>
        : never;

export type ChannelWiringHandlerOf<
    Channel extends keyof ChannelsMap, 
    Route extends keyof ChannelsMap[Channel]['routes'], 
    Method extends keyof ChannelsMap[Channel]['routes'][Route],
> =
    ChannelsMap[Channel]['routes'][Route][Method] extends { input: infer I; output: infer O }
        ? ChannelHandler<I, O>
        : never;
`
}

function generateChannels(
  logger: Logger,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  addonFunctions: Record<string, FunctionsMeta>,
  channelsMeta: ChannelsMeta
) {
  const state = { functions: { meta: functionsMeta }, addonFunctions }
  const requiredTypes = new Set<string>()
  const channelsObject: Record<
    string,
    {
      message: { inputs: string[] | null; outputs: string[] | null } | null
      routes: Record<
        string,
        Record<
          string,
          {
            inputTypes: string[] | null
            outputTypes: string[] | null
          }
        >
      >
    }
  > = {}

  for (const meta of Object.values(channelsMeta)) {
    const { name, messageWirings, message } = meta

    if (!channelsObject[name]) {
      channelsObject[name] = { message: null, routes: {} }
    }

    if (message) {
      const func = resolveFunctionMeta(state, message.pikkuFuncId)
      if (!func) {
        throw new Error(
          `Function ${message.pikkuFuncId} not found in functionsMeta for channel ${name}`
        )
      }
      const inputTypes = func.inputs || null
      const outputTypes = func.outputs || null
      channelsObject[name].message = {
        inputs: normalizeTypes(logger, typesMap, inputTypes),
        outputs: normalizeTypes(logger, typesMap, outputTypes),
      }
      channelsObject[name].message.inputs?.forEach((type) =>
        requiredTypes.add(type)
      )
      channelsObject[name].message.outputs?.forEach((type) =>
        requiredTypes.add(type)
      )
    }

    for (const [key, route] of Object.entries(messageWirings)) {
      if (!channelsObject[name].routes[key]) {
        channelsObject[name].routes[key] = {}
      }
      for (const [method, { pikkuFuncId }] of Object.entries(route)) {
        // Addon functions are namespaced ('ns:fn') and their types aren't in
        // the consumer's local typesMap, but are reachable via FlattenedRPCMap.
        if (pikkuFuncId.includes(':')) {
          const inputType = `FlattenedRPCMap['${pikkuFuncId}']['input']`
          const outputType = `FlattenedRPCMap['${pikkuFuncId}']['output']`
          channelsObject[name].routes[key][method] = {
            inputTypes: [inputType],
            outputTypes: [outputType],
          }
          requiredTypes.add(inputType)
          requiredTypes.add(outputType)
          continue
        }
        const func = resolveFunctionMeta(state, pikkuFuncId)
        if (!func) {
          throw new Error(
            `Function ${pikkuFuncId} not found in functionsMeta for channel ${name}, route ${key}, method ${method}`
          )
        }
        const inputTypes = func.inputs || null
        const outputTypes = func.outputs || null
        channelsObject[name].routes[key][method] = {
          inputTypes: normalizeTypes(logger, typesMap, inputTypes),
          outputTypes: normalizeTypes(logger, typesMap, outputTypes),
        }
        channelsObject[name].routes[key][method].inputTypes?.forEach((type) =>
          requiredTypes.add(type)
        )
        channelsObject[name].routes[key][method].outputTypes?.forEach((type) =>
          requiredTypes.add(type)
        )
      }
    }
  }

  let routesStr = 'export type ChannelsMap = {\n'

  for (const [channelPath, { routes, message }] of Object.entries(
    channelsObject
  )) {
    routesStr += `  readonly '${channelPath}': {\n`

    // Add `routes` object
    routesStr += `    readonly routes: {\n`
    for (const [key, methods] of Object.entries(routes)) {
      routesStr += `      readonly ${key}: {\n`
      for (const [method, handler] of Object.entries(methods)) {
        routesStr += `        readonly ${method}: ChannelHandler<${
          formatTypeArray(handler.inputTypes) || 'void'
        }, ${formatTypeArray(handler.outputTypes) || 'never'}>,\n`
      }
      routesStr += '      },\n'
    }
    routesStr += '    },\n'

    // Add `defaultMessage` outside `routes`
    if (message) {
      routesStr += `    readonly defaultMessage: ChannelHandler<${formatTypeArray(
        message.inputs
      )}, ${formatTypeArray(message.outputs)}>,\n`
    } else {
      routesStr += `    readonly defaultMessage: never,\n`
    }

    routesStr += '  },\n'
  }

  routesStr += '};'

  return { channels: routesStr, requiredTypes }
}

// Utility to format type arrays
function formatTypeArray(types: string[] | null): string {
  return types ? types.join(' | ') : 'null'
}

function normalizeTypes(
  logger: Logger,
  typesMap: TypesMap,
  types: string[] | null
): string[] | null {
  if (!types || types.length === 0) return types

  const resolved = types.filter((type) => hasType(typesMap, type))

  if (resolved.length > 0) {
    return resolved
  }

  logger.warn(
    `Channel type '${types.join(' | ')}' not found in local typesMap, falling back to unknown`
  )
  return ['unknown']
}

function hasType(typesMap: TypesMap, type: string): boolean {
  if (['void', 'never', 'unknown', 'null', 'undefined'].includes(type)) {
    return true
  }

  try {
    typesMap.getTypeMeta(type)
    return true
  } catch {
    return false
  }
}
