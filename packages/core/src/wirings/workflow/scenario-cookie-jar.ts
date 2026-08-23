export interface ScenarioCookieJar {
  fetch: typeof fetch
  clear(): void
  readonly empty: boolean
}

/**
 * A cookie store for a scenario run, so a step that signs in leaves the session
 * cookie behind for the steps after it.
 */
export const createCookieJar = (apiUrl: string): ScenarioCookieJar => {
  const jar = new Map<string, string>()
  const origin = new URL(apiUrl).origin
  return {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      headers.set('origin', origin)
      // The caller's own cookie header wins per name: a request that already
      // carries a session is stating which one it means, and emitting the jar's
      // copy alongside it sends the same name twice.
      const caller = headers.get('cookie')
      const named = new Set(
        (caller ?? '')
          .split(';')
          .map((pair) => pair.split('=')[0]?.trim())
          .filter(Boolean)
      )
      const held = [...jar]
        .filter(([name]) => !named.has(name))
        .map(([name, value]) => `${name}=${value}`)
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
