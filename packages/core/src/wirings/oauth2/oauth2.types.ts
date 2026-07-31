export type OAuth2AppCredential = {
  clientId: string
  clientSecret?: string // Optional for PKCE flows
}

export type OAuth2Token = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number // Unix timestamp
  tokenType: string
  scope?: string
}
