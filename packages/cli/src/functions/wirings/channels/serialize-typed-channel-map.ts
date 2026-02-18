import { ChannelsMeta } from '@pikku/core/channel'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap, generateCustomTypes } from '@pikku/inspector'
import { FunctionsMeta } from '@pikku/core'
import { Logger } from '@pikku/core/services'

export const serializeTypedChannelsMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  channelsMeta: ChannelsMeta
): string => {
  const { channels, requiredTypes } = generateChannels(
    functionsMeta,
    channelsMeta
  )
  typesMap.customTypes.forEach(({ references }) => {
    for (const reference of references) {
      if (reference !== '__object' && !reference.startsWith('__object_')) {
        requiredTypes.add(reference)
      }
    }
  })

  const imports = serializeImportMap(
    logger,
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes
  )
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)

  return `/**
 * This provides the structure needed for TypeScript to be aware of channels
 */

${imports}
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
  functionsMeta: FunctionsMeta,
  channelsMeta: ChannelsMeta
) {
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
      const func = functionsMeta[message.pikkuFuncId]
      if (!func) {
        throw new Error(
          `Function ${message.pikkuFuncId} not found in functionsMeta for channel ${name}`
        )
      }
      const inputTypes = func.inputs || null
      const outputTypes = func.outputs || null
      channelsObject[name].message = {
        inputs: inputTypes,
        outputs: outputTypes,
      }
      inputTypes?.forEach((type) => requiredTypes.add(type))
      outputTypes?.forEach((type) => requiredTypes.add(type))
    }

    for (const [key, route] of Object.entries(messageWirings)) {
      if (!channelsObject[name].routes[key]) {
        channelsObject[name].routes[key] = {}
      }
      for (const [method, { pikkuFuncId }] of Object.entries(route)) {
        const func = functionsMeta[pikkuFuncId]
        if (!func) {
          throw new Error(
            `Function ${pikkuFuncId} not found in functionsMeta for channel ${name}, route ${key}, method ${method}`
          )
        }
        const inputTypes = func.inputs || null
        const outputTypes = func.outputs || null
        channelsObject[name].routes[key][method] = {
          inputTypes,
          outputTypes,
        }
        inputTypes?.forEach((type) => requiredTypes.add(type))
        outputTypes?.forEach((type) => requiredTypes.add(type))
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
