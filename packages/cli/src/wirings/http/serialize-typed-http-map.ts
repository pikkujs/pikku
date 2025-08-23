import { HTTPWiringsMeta } from '@pikku/core/http'
import { serializeImportMap } from '../../serialize-import-map.js'
import { MetaInputTypes, TypesMap } from '@pikku/inspector'
import { FunctionsMeta } from '@pikku/core'
import { generateCustomTypes } from '../../utils.js'

export const serializeTypedHTTPWiringsMap = (
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  wiringsMeta: HTTPWiringsMeta,
  metaTypes: MetaInputTypes
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedMetaTypes = generateMetaTypes(metaTypes, typesMap)
  const serializedHTTPWirings = generateHTTPWirings(
    wiringsMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

  const serializedImportMap = serializeImportMap(
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes
  )

  return `/**
 * This provides the structure needed for typescript to be aware of routes and their return types
 */
    
${serializedImportMap}
${serializedCustomTypes}
${serializedMetaTypes}

interface HTTPWiringHandler<I, O> {
    input: I;
    output: O;
}

${serializedHTTPWirings}

export type HTTPWiringHandlerOf<HTTPWiring extends keyof HTTPWiringsMap, Method extends keyof HTTPWiringsMap[HTTPWiring]> =
    HTTPWiringsMap[HTTPWiring][Method] extends { input: infer I; output: infer O }
        ? HTTPWiringHandler<I, O>
        : never;

export type HTTPWiringsWithMethod<Method extends string> = {
  [HTTPWiring in keyof HTTPWiringsMap]: Method extends keyof HTTPWiringsMap[HTTPWiring] ? HTTPWiring : never;
}[keyof HTTPWiringsMap];
  `
}

function generateHTTPWirings(
  routesMeta: HTTPWiringsMeta,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  // Initialize an object to collect routes
  const routesObj: Record<
    string,
    Record<string, { inputType: string; outputType: string }>
  > = {}

  for (const methods of Object.values(routesMeta)) {
    for (const meta of Object.values(methods)) {
      const { route, method, pikkuFuncName } = meta
      const functionMeta = functionsMeta[pikkuFuncName]
      if (!functionMeta) {
        throw new Error(
          `Function ${pikkuFuncName} not found in functionsMeta. Please check your configuration.`
        )
      }
      const input = functionMeta.inputs ? functionMeta.inputs[0] : undefined
      const output = functionMeta.outputs ? functionMeta.outputs[0] : undefined

      // Initialize the route entry if it doesn't exist
      if (!routesObj[route]) {
        routesObj[route] = {}
      }

      // Store the input and output types separately for RouteHandler
      const inputType = input ? typesMap.getTypeMeta(input).uniqueName : 'null'
      const outputType = output
        ? typesMap.getTypeMeta(output).uniqueName
        : 'null'

      requiredTypes.add(inputType)
      requiredTypes.add(outputType)

      // Add method entry
      routesObj[route][method] = {
        inputType,
        outputType,
      }
    }
  }

  // Build the routes object as a string
  let routesStr = 'export type HTTPWiringsMap = {\n'

  for (const [routePath, methods] of Object.entries(routesObj)) {
    routesStr += `  readonly '${routePath}': {\n`
    for (const [method, handler] of Object.entries(methods)) {
      routesStr += `    readonly ${method.toUpperCase()}: HTTPWiringHandler<${handler.inputType}, ${handler.outputType}>,\n`
    }
    routesStr += '  },\n'
  }

  routesStr += '};'

  return routesStr
}

const generateMetaTypes = (metaTypes: MetaInputTypes, typesMap: TypesMap) => {
  const nameToTypeMap = Array.from(metaTypes.entries()).reduce<
    Map<string, string>
  >((result, [_name, { query, body, params }]) => {
    const { uniqueName } = typesMap.getTypeMeta(_name)
    const queryType =
      query && query.length > 0
        ? `Pick<${uniqueName}, '${query?.join("' | '")}'>`
        : undefined
    if (queryType) {
      result.set(`${uniqueName}Query`, queryType)
    }
    const paramsType =
      params && params.length > 0
        ? `Pick<${uniqueName}, '${params.join("' | '")}'>`
        : undefined
    if (paramsType) {
      result.set(`${uniqueName}Params`, paramsType)
    }
    const bodyType =
      (body && body.length > 0) || (params && params.length > 0)
        ? `Omit<${uniqueName}, '${[...new Set([...(query || []), ...(params || [])])].join("' | '")}'>`
        : uniqueName!
    if (bodyType) {
      result.set(`${uniqueName}Body`, bodyType)
    }
    return result
  }, new Map())

  return `
// The '& {}' is a workaround for not directly refering to a type since it confuses typescript
${Array.from(nameToTypeMap.entries())
  .map(([name, type]) => `export type ${name} = ${type} & {}`)
  .join('\n')}`
}
