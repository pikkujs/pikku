import { pikkuAddonWireServices } from '#pikku'
import { ForbiddenError } from '@pikku/core/errors'
import { OAuthApiClient } from './oauth-api-client.js'

export const createWireServices = pikkuAddonWireServices(
  async (_services, wire) => {
    const cred = await wire.getCredential?.<{ accessToken: string }>(
      'user-oauth'
    )
    if (!cred?.accessToken) {
      throw new ForbiddenError('Missing user-oauth credential')
    }
    return {
      oauthApiClient: new OAuthApiClient(cred.accessToken),
    }
  }
)
