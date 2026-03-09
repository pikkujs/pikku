import { pikkuServices } from '#pikku'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { LocalContent } from '@pikku/core/services/local-content'
import { tmpdir } from 'os'
import { join } from 'path'

export const createSingletonServices = pikkuServices(
  async (_config, existingServices) => {
    const variables =
      existingServices?.variables ?? new LocalVariablesService(process.env)
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const logger = existingServices?.logger ?? new ConsoleLogger()

    const uploadPath = join(tmpdir(), 'pikku-screenshot-test')
    const content = new LocalContent(
      {
        localFileUploadPath: uploadPath,
        uploadUrlPrefix: '/uploads',
        assetUrlPrefix: '/assets',
      },
      logger
    )

    return {
      config: {},
      logger,
      variables,
      secrets,
      content,
    } as any
  }
)
