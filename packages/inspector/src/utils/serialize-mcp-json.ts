import type { InspectorLogger, InspectorState } from '../types.js'
import type { JSONValue } from '@pikku/core/utils'
import { resolveFunctionMeta } from './resolve-function-meta.js'

interface MCPEndpoint {
  uri?: string
  name: string
  description?: string
  parameters?: JSONValue
  returns?: JSONValue
  streaming?: boolean
}

/**
 * Serializes one MCP endpoint's manifest.
 *
 * A project can serve several endpoints, and a wiring belongs to exactly one of
 * them: the one named by its `surface`. Passing no surface serializes the
 * default endpoint, which is every wiring that named none — so a project with
 * no surfaces at all gets the single manifest it always got.
 */
export const serializeMCPJson = (
  logger: InspectorLogger,
  state: InspectorState,
  surface?: string
): string => {
  const { mcpEndpoints, functions, schemas } = state
  const { typesMap } = functions
  const { resourcesMeta, toolsMeta, promptsMeta } = mcpEndpoints
  const onThisSurface = (meta: { surface?: string }) =>
    (meta.surface ?? undefined) === surface

  const tools: MCPEndpoint[] = []
  const resources: MCPEndpoint[] = []
  const prompts: any[] = []

  const loadSchema = (typeName: string | undefined): JSONValue | undefined => {
    if (
      !typeName ||
      [
        'boolean',
        'string',
        'number',
        'null',
        'undefined',
        'void',
        'unknown',
        'never',
      ].includes(typeName)
    ) {
      return undefined
    }

    // Try local typesMap first, fall back to direct schema lookup (for addon types)
    let uniqueName: string | undefined
    try {
      uniqueName = typesMap.getUniqueName(typeName)
    } catch {
      // Type not in local typesMap — try direct schema lookup (addon schemas)
      uniqueName = typeName
    }

    const schema = schemas[uniqueName]
    if (!schema) {
      logger.warn(
        `Serialize MCP: Could not find schema for type: ${uniqueName}`
      )
      return undefined
    }

    return schema
  }

  for (const [name, endpointMeta] of Object.entries(resourcesMeta)) {
    if (!onThisSurface(endpointMeta)) continue
    const functionMeta = resolveFunctionMeta(state, endpointMeta.pikkuFuncId)
    if (!functionMeta) {
      logger.warn(
        `Function ${endpointMeta.pikkuFuncId} not found in functionsMeta. Skipping resource ${name}.`
      )
      continue
    }

    const inputType = functionMeta.inputs?.[0]
    const outputType = functionMeta.outputs?.[0]

    const parameters = loadSchema(inputType)
    const returns = loadSchema(outputType)

    resources.push({
      uri: name,
      name,
      description: endpointMeta.description,
      ...(parameters && { parameters }),
      ...(returns && { returns }),
      ...(endpointMeta.streaming && { streaming: true }),
    })
  }

  for (const [name, endpointMeta] of Object.entries(toolsMeta)) {
    if (!onThisSurface(endpointMeta)) continue
    const functionMeta = resolveFunctionMeta(state, endpointMeta.pikkuFuncId)
    if (!functionMeta) {
      logger.warn(
        `Function ${endpointMeta.pikkuFuncId} not found in functionsMeta. Skipping tool ${name}.`
      )
      continue
    }

    const inputType = functionMeta.inputs?.[0]
    const outputType = functionMeta.outputs?.[0]

    const parameters = loadSchema(inputType)
    const returns = loadSchema(outputType)

    tools.push({
      name,
      description: endpointMeta.description,
      ...(parameters && { parameters }),
      ...(returns && { returns }),
      ...(endpointMeta.streaming && { streaming: true }),
    })
  }

  for (const [name, endpointMeta] of Object.entries(promptsMeta)) {
    if (!onThisSurface(endpointMeta)) continue
    const functionMeta = resolveFunctionMeta(state, endpointMeta.pikkuFuncId)
    if (!functionMeta) {
      logger.warn(
        `Function ${endpointMeta.pikkuFuncId} not found in functionsMeta. Skipping prompt ${name}.`
      )
      continue
    }

    const inputType = functionMeta.inputs?.[0]
    const inputSchema = loadSchema(inputType)

    const argumentsArray: any[] = []
    if (
      inputSchema &&
      typeof inputSchema === 'object' &&
      !(inputSchema instanceof Array)
    ) {
      const properties = inputSchema.properties as Record<string, any>
      const required = (inputSchema.required as string[]) || []

      for (const [propName, propSchema] of Object.entries(properties)) {
        argumentsArray.push({
          name: propName,
          description: propSchema.description || `${propName} parameter`,
          required: required.includes(propName),
        })
      }
    }

    prompts.push({
      name,
      description: endpointMeta.description,
      arguments: argumentsArray,
    })
  }

  // The path only travels in a surface's own manifest: the default endpoint
  // stays at whatever the runtime mounts, which is what every existing project
  // already relies on.
  const mcpPath = surface ? mcpEndpoints.surfaces?.[surface] : undefined

  return JSON.stringify(
    { ...(mcpPath ? { mcpPath } : {}), tools, resources, prompts },
    null,
    2
  )
}
