import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { readFile } from 'fs/promises'
import { join } from 'path'

const generateMCPRuntimeMeta = (metaData: any) => {
  const runtimeMeta: any = {
    resourcesMeta: {},
    toolsMeta: {},
    promptsMeta: {},
  }

  // Process resources
  // Note: MCP requires 'description' field, so we only strip summary and errors
  for (const [resourceName, resourceMeta] of Object.entries(
    metaData.resourcesMeta
  )) {
    const { summary, errors, ...runtime } = resourceMeta as any
    runtimeMeta.resourcesMeta[resourceName] = runtime
  }

  // Process tools
  // Note: MCP requires 'description' field, so we only strip summary and errors
  for (const [toolName, toolMeta] of Object.entries(metaData.toolsMeta)) {
    const { summary, errors, ...runtime } = toolMeta as any
    runtimeMeta.toolsMeta[toolName] = runtime
  }

  // Process prompts
  // Note: MCP requires 'description' field, so we only strip summary and errors
  for (const [promptName, promptMeta] of Object.entries(metaData.promptsMeta)) {
    const { summary, errors, ...runtime } = promptMeta as any
    runtimeMeta.promptsMeta[promptName] = runtime
  }

  return runtimeMeta
}

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
      mcpWiringsMetaJsonFile,
      mcpWiringsMetaVerboseFile,
      mcpWiringsMetaVerboseJsonFile,
      packageMappings,
      schemaDirectory,
      schema,
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

    const metaData = {
      resourcesMeta: mcpEndpoints.resourcesMeta,
      toolsMeta: mcpEndpoints.toolsMeta,
      promptsMeta: promptsMetaWithArguments,
    }

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const runtimeMeta = generateMCPRuntimeMeta(metaData)

    // Write runtime JSON
    await writeFileInDir(
      logger,
      mcpWiringsMetaJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    // Write runtime TS
    const runtimeImportStatement = supportsImportAttributes
      ? `import metaData from './pikku-mcp-wirings-meta.gen.json' with { type: 'json' }`
      : `import metaData from './pikku-mcp-wirings-meta.gen.json'`

    await writeFileInDir(
      logger,
      mcpWiringsMetaFile,
      `import { pikkuState } from '@pikku/core'
${runtimeImportStatement}
pikkuState('mcp', 'resourcesMeta', metaData.resourcesMeta)
pikkuState('mcp', 'toolsMeta', metaData.toolsMeta)
pikkuState('mcp', 'promptsMeta', metaData.promptsMeta)`
    )

    // Write verbose JSON
    await writeFileInDir(
      logger,
      mcpWiringsMetaVerboseJsonFile,
      JSON.stringify(metaData, null, 2)
    )

    // Write verbose TS
    const verboseImportStatement = supportsImportAttributes
      ? `import metaData from './pikku-mcp-wirings-meta.verbose.gen.json' with { type: 'json' }`
      : `import metaData from './pikku-mcp-wirings-meta.verbose.gen.json'`

    await writeFileInDir(
      logger,
      mcpWiringsMetaVerboseFile,
      `import { pikkuState } from '@pikku/core'
${verboseImportStatement}
pikkuState('mcp', 'resourcesMeta', metaData.resourcesMeta)
pikkuState('mcp', 'toolsMeta', metaData.toolsMeta)
pikkuState('mcp', 'promptsMeta', metaData.promptsMeta)`
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
