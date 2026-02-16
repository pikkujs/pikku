import { pikkuSessionlessFunc } from '#pikku'
import {
  saveSchemas,
  generateSchemas,
  generateZodSchemas,
} from '../../../utils/schema-generator.js'
import { computeContractHashes } from '../../../utils/contract-versions.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { generateCustomTypes } from '../../../utils/custom-types-generator.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { join } from 'path'

/**
 * Generate JSON schemas from TypeScript types and Zod schemas
 */
export const pikkuSchemas = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    const zodSchemas = await generateZodSchemas(
      logger,
      visitState.schemaLookup,
      visitState.functions.typesMap
    )

    // TODO: Remove this once we optimise the build pipeline. This writes all
    // custom types (e.g. WorkflowStatus_*, WorkflowStart_*) to a temporary file
    // so ts-json-schema-generator can discover them. These types exist in
    // typesMap.customTypes in memory but aren't written to any .ts file after
    // the workflow re-inspection, so the schema generator can't find them.
    const requiredTypes = new Set<string>()
    const customTypesContent = generateCustomTypes(
      visitState.functions.typesMap,
      requiredTypes
    )
    await writeFileInDir(
      logger,
      join(config.outDir, 'pikku-custom-schema-types.gen.ts'),
      customTypesContent,
      { logWrite: false }
    )

    const schemas = await generateSchemas(
      logger,
      config.tsconfig,
      visitState.functions.typesMap,
      visitState.functions.meta,
      visitState.http.meta,
      config.schemasFromTypes,
      config.schema?.additionalProperties,
      visitState.schemaLookup
    )

    const allSchemas = { ...schemas, ...zodSchemas }

    computeContractHashes(
      allSchemas,
      visitState.functions.typesMap,
      visitState.functions.meta
    )

    await saveSchemas(
      logger,
      config.schemaDirectory,
      allSchemas,
      visitState.functions.typesMap,
      visitState.functions.meta,
      config.schema?.supportsImportAttributes ?? true,
      config.schemasFromTypes,
      visitState.schemaLookup,
      config.externalPackageName || null
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating schemas',
      commandEnd: 'Generated schemas',
    }),
  ],
})
