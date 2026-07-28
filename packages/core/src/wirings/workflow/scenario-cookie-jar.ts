/** A session held the way a browser holds one, for code driving a real target. */
export interface ScenarioCookieJar {
  /** `fetch`, but it sends what the target has set and keeps what it sets. */
  fetch: typeof fetch
  /** Forgets the session — what an actor does before signing in again. */
  clear(): void
  /**
   * Whether the target has set anything yet. This is a fact about the jar, not
   * about the session: a target that sets a CSRF or locale cookie before anyone
   * signs in fills the jar without establishing one. Whoever needs to know
   * whether a sign-in happened has to track the sign-in.
   */
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
      const held = [...jar].map(([name, value]) => `${name}=${value}`)
      const caller = headers.get('cookie')
      if (held.length > 0 || caller) {
        headers.set('cookie', [caller, ...held].filter(Boolean).join('; '))
      }
      const response = await fetch(input, { ...init, headers })
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(';')
        const separator = pair!.indexOf('=')
        if (separator > 0) {
          const name = pair!.slice(0, separator)
          const value = pair!.slice(separator + 1)
          // An empty value is how a target deletes a cookie — drop the name
          // rather than holding a cookie whose value says it is gone.
          if (value) {
            jar.set(name, value)
          } else {
            jar.delete(name)
          }
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
