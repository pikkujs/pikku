import { AWSSecrets } from '@pikku/aws-services'
import type {
  Config,
  SingletonServices,
} from '../../functions/types/application-types.d.js'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'

let config: Config
let singletonServices: SingletonServices

export const coldStart = async () => {
  if (!config) {
    config = await createConfig()
  }
  if (!singletonServices) {
    singletonServices = await createSingletonServices(config, {
      secrets: new AWSSecrets(config),
    })
  }
  return singletonServices
}
