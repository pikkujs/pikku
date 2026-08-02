import { assertSecretAllowedForHost, type SecretService } from '@pikku/core'
import type { CredentialService, MetaService } from '@pikku/core/services'

/** How a credential is applied to a request. Carries names only, never values. */
export type HttpRequestAuth = {
  mode: 'bearer' | 'apiKeyHeader' | 'apiKeyQuery' | 'basic' | 'oauth2'
  credential: string
  headerName?: string
  queryName?: string
  extraHeaders?: Record<string, string>
  source?: 'secret' | 'credential'
}

export type HttpRequesterRequest = {
  url: URL
  method: string
  headers: Record<string, string>
  body?: string
  auth?: HttpRequestAuth
  userId?: string
}

/** Performs an outbound HTTP request, resolving and attaching the credential itself. */
export interface HttpRequesterService {
  request(request: HttpRequesterRequest): Promise<Response>
}

export class PikkuHttpRequesterService implements HttpRequesterService {
  constructor(
    private secrets: SecretService,
    private metaService?: MetaService,
    private credentialService?: CredentialService,
    private requireAllowedHosts = false
  ) {}

  public async request({
    url,
    method,
    headers,
    body,
    auth,
    userId,
  }: HttpRequesterRequest): Promise<Response> {
    const requestHeaders = { ...headers }

    if (auth) {
      if (auth.mode === 'oauth2') {
        throw new Error(
          'httpRequest auth: OAuth2 is not yet supported (needs provider config + token flow)'
        )
      }
      for (const [key, value] of Object.entries(auth.extraHeaders ?? {})) {
        if (!(key in requestHeaders)) requestHeaders[key] = value
      }

      assertSecretAllowedForHost(
        auth.credential,
        url,
        await this.metaService?.getSecretsMeta(),
        this.requireAllowedHosts
      )

      const value = await this.resolveCredential(auth, userId)
      switch (auth.mode) {
        case 'bearer':
          requestHeaders['Authorization'] = `Bearer ${value}`
          break
        case 'apiKeyHeader':
          requestHeaders[auth.headerName ?? 'Authorization'] = value
          break
        case 'apiKeyQuery':
          url.searchParams.set(auth.queryName ?? 'api_key', value)
          break
        case 'basic':
          requestHeaders['Authorization'] =
            `Basic ${Buffer.from(value).toString('base64')}`
          break
      }
    }

    return await fetch(url, { method, headers: requestHeaders, body })
  }

  private async resolveCredential(
    auth: HttpRequestAuth,
    userId?: string
  ): Promise<string> {
    if (auth.source === 'credential') {
      if (!this.credentialService) {
        throw new Error(
          `httpRequest auth: credential "${auth.credential}" needs a credentialService, which this project does not wire`
        )
      }
      const value = await this.credentialService.get<string>(
        auth.credential,
        userId
      )
      if (value == null) {
        throw new Error(
          `httpRequest auth: could not resolve credential "${auth.credential}" — connect it before running this workflow`
        )
      }
      return value
    }

    try {
      return await this.secrets.getSecret(auth.credential)
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      throw new Error(
        `httpRequest auth: could not resolve secret "${auth.credential}" — provision it before running this workflow (${reason})`
      )
    }
  }
}
