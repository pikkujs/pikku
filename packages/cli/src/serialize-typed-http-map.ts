import { HTTPRoutesMeta } from '@pikku/core/http'
import { serializeImportMap } from './serialize-import-map.js'
import { MetaInputTypes, TypesMap } from '@pikku/inspector'
import { FunctionsMeta } from '@pikku/core'

export const serializeTypedRoutesMap = (
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  routesMeta: HTTPRoutesMeta,
  metaTypes: MetaInputTypes
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedMetaTypes = generateMetaTypes(metaTypes, typesMap)
  const serializedRoutes = generateRoutes(
    routesMeta,
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

interface RouteHandler<I, O> {
    input: I;
    output: O;
}

${serializedRoutes}

export type RouteHandlerOf<Route extends keyof RoutesMap, Method extends keyof RoutesMap[Route]> =
    RoutesMap[Route][Method] extends { input: infer I; output: infer O }
        ? RouteHandler<I, O>
        : never;

export type RoutesWithMethod<Method extends string> = {
  [Route in keyof RoutesMap]: Method extends keyof RoutesMap[Route] ? Route : never;
}[keyof RoutesMap];
  `
}

export function generateCustomTypes(
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  return `
// Custom types are those that are defined directly within generics
// or are broken into simpler types
${Array.from(typesMap.customTypes.entries())
  .map(([name, { type, references }]) => {
    references.forEach((name) => {
      const originalName = typesMap.getTypeMeta(name).originalName
      requiredTypes.add(originalName)
    })
    return `export type ${name} = ${type}`
  })
  .join('\n')}`
}

function generateRoutes(
  routesMeta: HTTPRoutesMeta,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  // Initialize an object to collect routes
  const routesObj: Record<
    string,
    Record<string, { inputType: string; outputType: string }>
  > = {}

  for (const meta of routesMeta) {
    const { route, method, pikkuFuncName } = meta
    const { inputs, outputs } = functionsMeta[pikkuFuncName]
    const input = inputs ? inputs[0] : undefined
    const output = outputs ? outputs[0] : undefined

    // Initialize the route entry if it doesn't exist
    if (!routesObj[route]) {
      routesObj[route] = {}
    }

    // Store the input and output types separately for RouteHandler
    const inputType = input ? typesMap.getTypeMeta(input).uniqueName : 'null'
    const outputType = output ? typesMap.getTypeMeta(output).uniqueName : 'null'

    requiredTypes.add(inputType)
    requiredTypes.add(outputType)

    // Add method entry
    routesObj[route][method] = {
      inputType,
      outputType,
    }
  }

  // Build the routes object as a string
  let routesStr = 'export type RoutesMap = {\n'

  for (const [routePath, methods] of Object.entries(routesObj)) {
    routesStr += `  readonly '${routePath}': {\n`
    for (const [method, handler] of Object.entries(methods)) {
      routesStr += `    readonly ${method.toUpperCase()}: RouteHandler<${handler.inputType}, ${handler.outputType}>,\n`
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
