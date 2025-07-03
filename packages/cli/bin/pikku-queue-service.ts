import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { serializeQueueWrapper } from '../src/serialize-queue-wrapper.js'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils/utils.js'

export const pikkuQueueService = async ({
  queueFile,
  queueMapDeclarationFile,
  packageMappings,
}: PikkuCLIConfig) => {
  await logCommandInfoAndTime(
    'Generating queue service wrapper',
    'Generated queue service wrapper',
    [queueFile === undefined, "queueFile isn't set in the pikku config"],
    async () => {
      if (!queueFile) {
        throw new Error("queueFile is isn't set in the pikku config")
      }

      const queueMapDeclarationPath = getFileImportRelativePath(
        queueFile,
        queueMapDeclarationFile,
        packageMappings
      )

      const content = [serializeQueueWrapper(queueMapDeclarationPath)]
      await writeFileInDir(queueFile, content.join('\n'))
    }
  )
}

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  logPikkuLogo()
  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir', 'queueFile'],
    options.tags,
    true
  )
  await pikkuQueueService(cliConfig)
}

export const queue = (program: Command): void => {
  program
    .command('queue')
    .description('generate queue service wrapper')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
