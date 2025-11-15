import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

const generateCLIRuntimeMeta = (meta: any) => {
  const runtimeMeta: any = {
    programs: {},
    renderers: meta.renderers, // Renderers don't have verbose fields
  }

  // Process programs and their commands
  for (const [programName, programMeta] of Object.entries(meta.programs)) {
    const program = programMeta as any
    runtimeMeta.programs[programName] = {
      program: program.program,
      commands: processCommands(program.commands),
      options: program.options,
      defaultRenderName: program.defaultRenderName,
    }
  }

  return runtimeMeta
}

const processCommands = (commands: any): any => {
  const processedCommands: any = {}

  for (const [commandName, commandMeta] of Object.entries(commands)) {
    const { summary, description, errors, ...runtime } = commandMeta as any

    // Recursively process subcommands
    if (runtime.subcommands) {
      runtime.subcommands = processCommands(runtime.subcommands)
    }

    processedCommands[commandName] = runtime
  }

  return processedCommands
}

export const pikkuCLI: any = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      cliWiringsFile,
      cliWiringMetaFile,
      cliWiringMetaJsonFile,
      cliWiringMetaVerboseFile,
      cliWiringMetaVerboseJsonFile,
      packageMappings,
      schema,
    } = config
    const { cli } = visitState

    // Generate CLI wirings file
    await writeFileInDir(
      logger,
      cliWiringsFile,
      serializeFileImports(
        'wireCLI',
        cliWiringsFile,
        cli.files,
        packageMappings
      )
    )

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const runtimeMeta = generateCLIRuntimeMeta(cli.meta)

    // Write runtime JSON
    await writeFileInDir(
      logger,
      cliWiringMetaJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    // Write runtime TS
    const runtimeImportStatement = supportsImportAttributes
      ? `import metaData from './pikku-cli-wirings-meta.gen.json' with { type: 'json' }`
      : `import metaData from './pikku-cli-wirings-meta.gen.json'`

    await writeFileInDir(
      logger,
      cliWiringMetaFile,
      `import { pikkuState } from '@pikku/core'\nimport { CLIMeta } from '@pikku/core/cli'\n${runtimeImportStatement}\npikkuState('cli', 'meta', metaData as CLIMeta)`
    )

    if (config.verboseMeta) {
      // Write verbose JSON
      await writeFileInDir(
        logger,
        cliWiringMetaVerboseJsonFile,
        JSON.stringify(cli.meta, null, 2)
      )

      // Write verbose TS
      const verboseImportStatement = supportsImportAttributes
        ? `import metaData from './pikku-cli-wirings-meta.verbose.gen.json' with { type: 'json' }`
        : `import metaData from './pikku-cli-wirings-meta.verbose.gen.json'`

      await writeFileInDir(
        logger,
        cliWiringMetaVerboseFile,
        `import { pikkuState } from '@pikku/core'\nimport { CLIMeta } from '@pikku/core/cli'\n${verboseImportStatement}\npikkuState('cli', 'meta', metaData as CLIMeta)`
      )
    }

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding CLI commands',
      commandEnd: 'Found CLI commands',
    }),
  ],
})
