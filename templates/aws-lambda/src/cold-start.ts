import { AWSSecrets } from '@pikku/aws-services'
import {
  Config,
  SingletonServices,
} from '../../functions/types/application-types.js'
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
      // @ts-ignore: TODO AWS Region required for this to work..
      secrets: new AWSSecrets(config),
    })
  }
  return singletonServices
}
