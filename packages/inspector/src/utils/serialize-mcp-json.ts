import type { InspectorLogger, InspectorState } from '../types.js'
import type { JSONValue } from '@pikku/core'
import { resolveFunctionMeta } from './resolve-function-meta.js'

interface MCPEndpoint {
  uri?: string
  name: string
  description?: string
  parameters?: JSONValue
  returns?: JSONValue
  streaming?: boolean
}

export const serializeMCPJson = (
  logger: InspectorLogger,
  state: InspectorState
): string => {
  const { mcpEndpoints, functions, schemas } = state
  const { typesMap } = functions
  const { resourcesMeta, toolsMeta, promptsMeta } = mcpEndpoints

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

    // MCP tool annotations from riskLevel/idempotent
    const annotations: Record<string, boolean> = {}
    if (functionMeta.riskLevel === 'read') annotations.readOnlyHint = true
    if (functionMeta.riskLevel === 'destructive') annotations.destructiveHint = true
    if (functionMeta.idempotent) annotations.idempotentHint = true

    tools.push({
      name,
      description: endpointMeta.description,
      ...(parameters && { parameters }),
      ...(returns && { returns }),
      ...(endpointMeta.streaming && { streaming: true }),
      ...(Object.keys(annotations).length > 0 && { annotations }),
    })
  }

  for (const [name, endpointMeta] of Object.entries(promptsMeta)) {
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

  return JSON.stringify({ tools, resources, prompts }, null, 2)
}
