import { ChannelsMeta } from '@pikku/core/channel'
import { serializeImportMap } from './serialize-import-map.js'
import { TypesMap } from '@pikku/inspector'
import { generateCustomTypes } from './serialize-typed-http-map.js'

export const serializeTypedChannelsMap = (
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  channelsMeta: ChannelsMeta
): string => {
  const { channels, requiredTypes } = generateChannels(channelsMeta)
  typesMap.customTypes.forEach(({ references }) => {
    for (const reference of references) {
      requiredTypes.add(reference)
    }
  })
  const imports = serializeImportMap(
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

export type ChannelRouteHandlerOf<
    Channel extends keyof ChannelsMap, 
    Route extends keyof ChannelsMap[Channel]['routes'], 
    Method extends keyof ChannelsMap[Channel]['routes'][Route],
> =
    ChannelsMap[Channel]['routes'][Route][Method] extends { input: infer I; output: infer O }
        ? ChannelHandler<I, O>
        : never;
`
}

function generateChannels(channelsMeta: ChannelsMeta) {
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
    const { name, messageRoutes, message } = meta

    if (!channelsObject[name]) {
      channelsObject[name] = { message, routes: {} }
    }

    for (const [key, route] of Object.entries(messageRoutes)) {
      if (!channelsObject[name].routes[key]) {
        channelsObject[name].routes[key] = {}
      }
      for (const [method, { inputs, outputs }] of Object.entries(route)) {
        const inputTypes = inputs || null
        const outputTypes = outputs || null
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
