import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
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

export const pikkuMCP: any = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { mcpEndpoints, functions } = await getInspectorState()
    const {
      mcpWiringsFile,
      mcpWiringsMetaFile,
      packageMappings,
      schemaDirectory,
    } = config

    await writeFileInDir(
      logger,
      mcpWiringsFile,
      serializeFileImports(
        'wireMCPResource or wireMCPTool',
        mcpWiringsFile,
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
      mcpWiringsMetaFile,
      `import { pikkuState } from '@pikku/core'
pikkuState('mcp', 'resourcesMeta', ${JSON.stringify(mcpEndpoints.resourcesMeta, null, 2)})
pikkuState('mcp', 'toolsMeta', ${JSON.stringify(mcpEndpoints.toolsMeta, null, 2)})
pikkuState('mcp', 'promptsMeta', ${JSON.stringify(promptsMetaWithArguments, null, 2)})`
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding MCP endpoints',
      commandEnd: 'Found MCP endpoints',
    }),
  ],
})
