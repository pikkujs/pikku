/** Secret shared with the OAuth proxy, which signs the hand-back with it. */
export const OAUTH_PROXY_SECRET_ID = 'OAUTH_PROXY_SECRET'
/** The proxy's base URL, which every proxied provider's callback goes through. */
export const OAUTH_PROXY_URL_VARIABLE = 'OAUTH_PROXY_URL'
/** Optional id prefixed onto proxied state, so one proxy can serve several stages. */
export const OAUTH_PROXY_KEY_ID_VARIABLE = 'OAUTH_PROXY_KEY_ID'
/** Comma-separated provider ids to route through the proxy. */
export const OAUTH_PROXY_PROVIDERS_VARIABLE = 'OAUTH_PROXY_PROVIDERS'

/** Providers a host may proxy. Each needs its `<ID>_OAUTH` secret declared. */
export const OAUTH_PROXY_PROVIDER_IDS = [
  'atlassian',
  'cloudflare',
  'discord',
  'dropbox',
  'facebook',
  'figma',
  'github',
  'gitlab',
  'google',
  'huggingface',
  'kakao',
  'kick',
  'line',
  'linear',
  'linkedin',
  'microsoft',
  'naver',
  'notion',
  'paybin',
  'paypal',
  'polar',
  'railway',
  'salesforce',
  'slack',
  'spotify',
  'twitch',
  'twitter',
  'vercel',
  'vk',
  'zoom',
] as const
