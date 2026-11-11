const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/**
 * Whether `hostname` (as `URL` normalises it) can only reach this machine:
 * `localhost`, an address in 127.0.0.0/8, or `::1`. A name that merely starts
 * with `127.` or `localhost.` is a public name and is refused.
 */
export const isLoopbackHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '[::1]') return true
  const match = IPV4.exec(host)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet <= 255) && octets[0] === 127
}

/**
 * Parses an OTLP endpoint and refuses anything that is not loopback, unless the
 * caller opted in. A Studio-served app must never be pointed at the internet by
 * a stray environment variable.
 */
export const parseOtlpEndpoint = (
  endpoint: string,
  allowRemote: boolean
): URL => {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('PIKKU_OTLP_ENDPOINT is not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PIKKU_OTLP_ENDPOINT must be an http or https URL')
  }
  if (!allowRemote && !isLoopbackHost(url.hostname)) {
    throw new Error(
      `PIKKU_OTLP_ENDPOINT points at ${url.hostname}, which is not a loopback address. ` +
        'Set PIKKU_OTLP_ALLOW_REMOTE=1 to export telemetry off this machine.'
    )
  }
  if (
    url.search !== '' ||
    url.hash !== '' ||
    endpoint.includes('?') ||
    endpoint.includes('#')
  ) {
    throw new Error(
      'PIKKU_OTLP_ENDPOINT must not contain a query string or fragment; send headers in PIKKU_OTLP_HEADERS'
    )
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error(
      'PIKKU_OTLP_ENDPOINT must not contain credentials; send them in PIKKU_OTLP_HEADERS'
    )
  }
  if (
    allowRemote &&
    !isLoopbackHost(url.hostname) &&
    url.protocol !== 'https:'
  ) {
    throw new Error(
      'PIKKU_OTLP_ENDPOINT must be https when it is not a loopback address'
    )
  }
  return url
}
