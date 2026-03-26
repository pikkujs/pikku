import { pikkuAddonWireServices } from '#pikku'
import { MissingCredentialError } from '@pikku/core/errors'
import { OAuthApiClient } from './oauth-api-client.js'

export const createWireServices = pikkuAddonWireServices(
  async (_services, wire) => {
    const cred = await wire.getCredential?.<{ accessToken: string }>(
      'user-oauth'
    )
    if (!cred?.accessToken) {
      throw new MissingCredentialError(
        'user-oauth',
        'oauth2',
        '/credentials/user-oauth/connect'
      )
    }
    return {
      oauthApiClient: new OAuthApiClient(cred.accessToken),
    }
  }
)
