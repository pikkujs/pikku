export interface ScenarioCookieJar {
  fetch: typeof fetch
  clear(): void
  readonly empty: boolean
}

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
