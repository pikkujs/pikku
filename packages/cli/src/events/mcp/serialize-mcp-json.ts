import { readFile } from 'fs/promises'
import { join } from 'path'
import { MCPEndpointsMeta } from '@pikku/core'
import { FunctionsMeta, JSONValue } from '@pikku/core'
import { TypesMap } from '@pikku/inspector'

interface MCPTool {
  name: string
  description: string
  parameters?: JSONValue
  returns?: JSONValue
  streaming?: boolean
}

export const serializeMCPJson = async (
  schemaDirectory: string,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  mcpEndpointsMeta: MCPEndpointsMeta
): Promise<string> => {
  const tools: MCPTool[] = []

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

    try {
      const schemaPath = join(
        schemaDirectory,
        'schemas',
        `${uniqueName}.schema.json`
      )
      const schemaContent = await readFile(schemaPath, 'utf-8')
      return JSON.parse(schemaContent)
    } catch (e) {
      console.warn(`Could not load schema for type: ${uniqueName}`)
      return undefined
    }
  }

  // Process all MCP endpoints (tools and resources)
  for (const [name, endpointMeta] of Object.entries(mcpEndpointsMeta)) {
    const functionMeta = functionsMeta[endpointMeta.pikkuFuncName]
    if (!functionMeta) {
      continue
    }

    const inputType = functionMeta.inputs?.[0]
    const outputType = functionMeta.outputs?.[0]

    const parameters = await loadSchema(inputType)
    const returns = await loadSchema(outputType)

    tools.push({
      name,
      description: endpointMeta.description,
      ...(parameters && { parameters }),
      ...(returns && { returns }),
      ...(endpointMeta.streaming && { streaming: true }),
    })
  }

  return JSON.stringify({ tools }, null, 2)
}
