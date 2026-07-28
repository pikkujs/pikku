/** A session held the way a browser holds one, for code driving a real target. */
export interface ScenarioCookieJar {
  /** `fetch`, but it sends what the target has set and keeps what it sets. */
  fetch: typeof fetch
  /** Forgets the session — what an actor does before signing in again. */
  clear(): void
  /** Whether the target has set anything yet. */
  readonly empty: boolean
}

/**
 * A `fetch` that remembers cookies.
 *
 * A browser persists the session cookie on its own; anything driving a target
 * from this process has to. Every response is read, not just the sign-in, so a
 * cookie the target rotates mid-session is followed rather than dropped.
 *
 * The jar is a closure local, so two jars never share a session — which is what
 * lets one scenario sign in as several people without one of them inheriting
 * the other's session.
 *
 * It also stamps `Origin`, because Better Auth rejects a state-changing POST
 * whose Origin does not match its baseURL.
 */
export const createCookieJar = (apiUrl: string): ScenarioCookieJar => {
  const jar = new Map<string, string>()
  const origin = new URL(apiUrl).origin
  return {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      headers.set('origin', origin)
      if (jar.size > 0) {
        headers.set(
          'cookie',
          [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
        )
      }
      const response = await fetch(input, { ...init, headers })
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(';')
        const separator = pair!.indexOf('=')
        if (separator > 0) {
          jar.set(pair!.slice(0, separator), pair!.slice(separator + 1))
        }
      }
      return response
    },
    clear: () => jar.clear(),
    get empty() {
      return jar.size === 0
    },
  }
}
