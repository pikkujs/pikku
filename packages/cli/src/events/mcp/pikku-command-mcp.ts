import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'
import { readFile } from 'fs/promises'
import { join } from 'path'

// Helper function to generate arguments from schema
const generateArgumentsFromSchema = async (
  inputSchema: string | null,
  schemaDirectory: string,
  typesMap: any,
  logger: any
): Promise<Array<{ name: string; description: string; required: boolean }>> => {
  if (!inputSchema) return []

  if (
    ['boolean', 'string', 'number', 'null', 'undefined', 'void'].includes(
      inputSchema
    )
  ) {
    return []
  }

  const uniqueName = typesMap.getUniqueName(inputSchema)
  if (!uniqueName) return []

  try {
    const schemaPath = join(
      schemaDirectory,
      'schemas',
      `${uniqueName}.schema.json`
    )
    const schemaContent = await readFile(schemaPath, 'utf-8')
    const schema = JSON.parse(schemaContent)

    const argumentsArray: Array<{
      name: string
      description: string
      required: boolean
    }> = []
    if (schema && typeof schema === 'object' && schema.properties) {
      const properties = schema.properties as Record<string, any>
      const required = (schema.required as string[]) || []

      for (const [propName, propSchema] of Object.entries(properties)) {
        argumentsArray.push({
          name: propName,
          description: propSchema.description || `${propName} parameter`,
          required: required.includes(propName),
        })
      }
    }
    return argumentsArray
  } catch (e) {
    logger.warn(`Could not load schema for type: ${uniqueName}`)
    return []
  }
}

export const pikkuMCP: PikkuCommand = async (
  logger,
  { mcpEndpointsFile, mcpEndpointsMetaFile, packageMappings, schemaDirectory },
  { mcpEndpoints, functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding MCP endpoints',
    'Found MCP endpoints',
    [mcpEndpoints.files.size === 0],
    async () => {
      await writeFileInDir(
        logger,
        mcpEndpointsFile,
        serializeFileImports(
          'addMCPResource or addMCPTool',
          mcpEndpointsFile,
          mcpEndpoints.files,
          packageMappings
        )
      )

      // Populate arguments for prompts meta before serializing
      const promptsMetaWithArguments = { ...mcpEndpoints.promptsMeta }
      for (const promptMeta of Object.values(promptsMetaWithArguments)) {
        const functionMeta = functions.meta[promptMeta.pikkuFuncName]
        if (functionMeta) {
          const inputType = functionMeta.inputs?.[0]
          promptMeta.arguments = await generateArgumentsFromSchema(
            inputType || null,
            schemaDirectory || '',
            functions.typesMap,
            logger
          )
        }
      }

      await writeFileInDir(
        logger,
        mcpEndpointsMetaFile,
        `import { pikkuState } from '@pikku/core'
pikkuState('mcp', 'resourcesMeta', ${JSON.stringify(mcpEndpoints.resourcesMeta, null, 2)})
pikkuState('mcp', 'toolsMeta', ${JSON.stringify(mcpEndpoints.toolsMeta, null, 2)})
pikkuState('mcp', 'promptsMeta', ${JSON.stringify(promptsMetaWithArguments, null, 2)})`
      )
    }
  )
}
