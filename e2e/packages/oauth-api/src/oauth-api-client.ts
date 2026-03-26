/**
 * Simple API client that uses an OAuth access token for requests.
 * In a real app this would call an external API — here it just
 * returns the token info to prove credentials were loaded.
 */
export class OAuthApiClient {
  constructor(private accessToken: string) {}

  getProfile(): { authenticated: true; token: string } {
    return {
      authenticated: true,
      token: this.accessToken,
    }
  }
}
