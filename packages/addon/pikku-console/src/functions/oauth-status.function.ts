import { pikkuSessionlessFunc } from '#pikku'

export const oauthStatus = pikkuSessionlessFunc<
  { credentialName: string },
  {
    connected: boolean
    hasRefreshToken?: boolean
    expiresAt?: number
    isExpired?: boolean
  }
>({
  title: 'OAuth Status',
  description:
    'Given a credentialName, reads secrets metadata from wiringService, validates the credential exists and is OAuth2, then attempts to read the stored token from credential service (or secrets as fallback). Returns connection status data including whether a refresh token exists and expiration status.',
  expose: true,
  func: async (
    { logger, wiringService, secrets, credentialService },
    { credentialName }
  ) => {
    const secretsMeta = await wiringService.readSecretsMeta()

    const credential = secretsMeta[credentialName]
    if (!credential) {
      const available = Object.keys(secretsMeta).filter(
        (name) => secretsMeta[name].oauth2
      )
      throw new Error(
        `Credential '${credentialName}' not found. Available: ${available.join(', ') || 'none'}`
      )
    }

    if (!credential.oauth2) {
      throw new Error(
        `Credential '${credentialName}' is not an OAuth2 credential`
      )
    }

    try {
      let token: {
        accessToken: string
        refreshToken?: string
        expiresAt?: number
      } | null = null

      if (credentialService) {
        token = await credentialService.get(credentialName)
      }

      if (!token) {
        token = await secrets.getSecretJSON<{
          accessToken: string
          refreshToken?: string
          expiresAt?: number
        }>(credential.oauth2.tokenSecretId)
      }

      const expiresAt = token.expiresAt
      const isExpired = expiresAt ? new Date(expiresAt) < new Date() : undefined

      logger.info(`Token found for '${credentialName}'`)

      return {
        connected: true,
        hasRefreshToken: !!token.refreshToken,
        expiresAt,
        isExpired,
      }
    } catch {
      logger.info(`No token stored for '${credentialName}'`)
      return { connected: false }
    }
  },
})
