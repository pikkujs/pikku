/**
 * Map a fabric-api URL to its console URL by convention. Local dev uses
 * separate ports; prod uses subdomain swap (api.* → console.*).
 */
export function deriveConsoleUrl(apiUrl: string): string {
  const url = new URL(apiUrl)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = '7102'
    return url.toString()
  }
  url.hostname = url.hostname.replace(/^api\./, 'console.')
  return url.toString()
}
