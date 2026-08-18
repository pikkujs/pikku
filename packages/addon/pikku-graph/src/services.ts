import { pikkuAddonServices } from '#pikku/addon/setup'
import { PikkuHttpRequesterService } from './http-requester.service.js'

export const createSingletonServices = pikkuAddonServices(
  async (config, { jwt, secrets, metaService, credentialService }) => {
    const httpRequester = new PikkuHttpRequesterService(
      secrets,
      metaService,
      credentialService,
      config.secrets?.requireAllowedHosts === true
    )
    return { jwt, httpRequester }
  }
)
