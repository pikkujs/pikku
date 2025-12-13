import { readFile } from 'fs/promises'
import { join } from 'path'
import { MCPResourceMeta, MCPToolMeta, MCPPromptMeta } from '@pikku/core/mcp'
import { FunctionsMeta, JSONValue } from '@pikku/core'
import { TypesMap } from '@pikku/inspector'
import { CLILogger } from '../../../services/cli-logger.service.js'

interface MCPEndpoint {
  name: string
  description?: string
  parameters?: JSONValue
  returns?: JSONValue
  streaming?: boolean
}

export const serializeMCPJson = async (
  logger: CLILogger,
  schemaDirectory: string,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  mcpResourceMeta: MCPResourceMeta,
  mcpToolMeta: MCPToolMeta,
  mcpPromptMeta: MCPPromptMeta
): Promise<string> => {
  const tools: MCPEndpoint[] = []
  const resources: MCPEndpoint[] = []
  const prompts: any[] = []

  // Helper function to load schema from file
  const loadSchema = async (
    typeName: string | undefined
  ): Promise<JSONValue | undefined> => {
    if (
      !typeName ||
      ['boolean', 'string', 'number', 'null', 'undefined', 'void'].includes(
        typeName
      )
    ) {
      return undefined
    }

    const uniqueName = typesMap.getUniqueName(typeName)
    if (!uniqueName) {
      return undefined
    }

    const schemaPath = join(
      schemaDirectory,
      'schemas',
      `${uniqueName}.schema.json`
    )

    try {
      const schemaContent = await readFile(schemaPath, 'utf-8')
      return JSON.parse(schemaContent)
    } catch (e) {
      logger.warn(
        `Serialize MCP: Could not load schema for type: ${uniqueName} from ${schemaPath}`
      )
      console.error(e)
      return undefined
    }
  }

  // Process MCP resources
  for (const [name, endpointMeta] of Object.entries(mcpResourceMeta)) {
    const functionMeta = functionsMeta[endpointMeta.pikkuFuncName]
    if (!functionMeta) {
      logger.warn(
        `Function ${endpointMeta.pikkuFuncName} not found in functionsMeta. Skipping resource ${name}.`
      )
      continue
    }

    const inputType = functionMeta.inputs?.[0]
    const outputType = functionMeta.outputs?.[0]

    const parameters = await loadSchema(inputType)
    const returns = await loadSchema(outputType)

    const endpoint = {
      uri: name,
      name,
      description: endpointMeta.description,
      ...(parameters && { parameters }),
      ...(returns && { returns }),
      ...(endpointMeta.streaming && { streaming: true }),
    }

    resources.push(endpoint)
  }

  // Process MCP tools
  for (const [name, endpointMeta] of Object.entries(mcpToolMeta)) {
    const functionMeta = functionsMeta[endpointMeta.pikkuFuncName]
    if (!functionMeta) {
      logger.warn(
        `Function ${endpointMeta.pikkuFuncName} not found in functionsMeta. Skipping tool ${name}.`
      )
      continue
    }

    const inputType = functionMeta.inputs?.[0]
    const outputType = functionMeta.outputs?.[0]

    const parameters = await loadSchema(inputType)
    const returns = await loadSchema(outputType)

    const endpoint = {
      name,
      description: endpointMeta.description,
      ...(parameters && { parameters }),
      ...(returns && { returns }),
      ...(endpointMeta.streaming && { streaming: true }),
    }

    tools.push(endpoint)
  }

  // Process MCP prompts
  for (const [name, endpointMeta] of Object.entries(mcpPromptMeta)) {
    const functionMeta = functionsMeta[endpointMeta.pikkuFuncName]
    if (!functionMeta) {
      logger.warn(
        `Function ${endpointMeta.pikkuFuncName} not found in functionsMeta. Skipping prompt ${name}.`
      )
      continue
    }

    const inputType = functionMeta.inputs?.[0]
    // TODO: this needs to be a json schema type, not any
    const inputSchema: any = await loadSchema(inputType)

    // Generate arguments from input schema
    const argumentsArray: any[] = []
    if (
      inputSchema &&
      typeof inputSchema === 'object' &&
      inputSchema.properties
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

    const prompt = {
      name,
      description: endpointMeta.description,
      arguments: argumentsArray,
    }

    prompts.push(prompt)
  }

  return JSON.stringify({ tools, resources, prompts }, null, 2)
}
