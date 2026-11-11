/** An OAuth2 client registration. `clientSecret` is omitted for public clients using PKCE. */
export type OAuth2AppCredential = {
  clientId: string
  clientSecret?: string // Optional for PKCE flows
}

/** An OAuth2 token set as stored for a credential. `expiresAt` is a Unix timestamp; treat the token as secret. */
export type OAuth2Token = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number // Unix timestamp
  tokenType: string
  scope?: string
}
