/**
 * Map a cloud API URL to its web Studio URL by convention. Local dev uses
 * separate ports; prod uses subdomain swap (api.* → cloud.*).
 */
export function deriveConsoleUrl(apiUrl: string): string {
  const url = new URL(apiUrl)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = '7102'
    return url.toString()
  }
  url.hostname = url.hostname.replace(/^api\./, 'cloud.')
  return url.toString()
}
