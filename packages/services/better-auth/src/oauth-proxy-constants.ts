export const OAUTH_PROXY_SECRET_ID = 'OAUTH_PROXY_SECRET'
export const OAUTH_PROXY_URL_VARIABLE = 'OAUTH_PROXY_URL'
export const OAUTH_PROXY_KEY_ID_VARIABLE = 'OAUTH_PROXY_KEY_ID'
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
