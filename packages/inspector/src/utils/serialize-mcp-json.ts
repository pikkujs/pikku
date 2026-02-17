import type { InspectorLogger, InspectorState } from '../types.js'
import type { JSONValue } from '@pikku/core'

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
  const { meta: functionsMeta, typesMap } = functions
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

    const uniqueName = typesMap.getUniqueName(typeName)
    if (!uniqueName) {
      return undefined
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
    const functionMeta = functionsMeta[endpointMeta.pikkuFuncId]
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
    const functionMeta = functionsMeta[endpointMeta.pikkuFuncId]
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
    const functionMeta = functionsMeta[endpointMeta.pikkuFuncId]
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
