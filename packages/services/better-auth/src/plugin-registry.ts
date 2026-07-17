export interface AuthPluginDef {
  /** Human-readable name for the plugin (shown in the console SSO page). */
  displayName: string
}

/**
 * Maps better-auth `plugins` array entries to display metadata. The pikku CLI
 * reads each entry's callee name from the user's `betterAuth({ plugins: [...] })`
 * config (e.g. `bearer()` → `'bearer'`, `twoFactor()` → `'twoFactor'`) and looks
 * it up here to enrich the generated `auth-meta.gen.json`.
 *
 * Keys mirror better-auth's plugin factory export names (camelCase), NOT the
 * kebab-case plugin directory names. Plugins not listed here still appear in the
 * meta — the CLI derives a Title Case display name from the id (see
 * {@link pluginDisplayName}).
 */
export const PLUGIN_REGISTRY: Record<string, AuthPluginDef> = {
  actor: { displayName: 'Actor' },
  admin: { displayName: 'Admin' },
  anonymous: { displayName: 'Anonymous' },
  apiKey: { displayName: 'API Key' },
  bearer: { displayName: 'Bearer' },
  captcha: { displayName: 'Captcha' },
  customSession: { displayName: 'Custom Session' },
  delegatedAuth: { displayName: 'Delegated Auth' },
  deviceAuthorization: { displayName: 'Device Authorization' },
  emailOTP: { displayName: 'Email OTP' },
  fabric: { displayName: 'Fabric' },
  genericOAuth: { displayName: 'Generic OAuth' },
  haveIBeenPwned: { displayName: 'Have I Been Pwned' },
  jwt: { displayName: 'JWT' },
  lastLoginMethod: { displayName: 'Last Login Method' },
  magicLink: { displayName: 'Magic Link' },
  mcp: { displayName: 'MCP' },
  multiSession: { displayName: 'Multi-Session' },
  oAuthProxy: { displayName: 'OAuth Proxy' },
  oidcProvider: { displayName: 'OIDC Provider' },
  oneTap: { displayName: 'One Tap' },
  oneTimeToken: { displayName: 'One-Time Token' },
  openAPI: { displayName: 'OpenAPI' },
  organization: { displayName: 'Organization' },
  passkey: { displayName: 'Passkey' },
  phoneNumber: { displayName: 'Phone Number' },
  siwe: { displayName: 'Sign-In with Ethereum' },
  twoFactor: { displayName: 'Two-Factor' },
  username: { displayName: 'Username' },
}

/**
 * The display name for a plugin id: the registered name if known, otherwise a
 * Title Case derivation of the camelCase id (`fooBar` → `Foo Bar`).
 */
export const pluginDisplayName = (id: string): string => {
  const known = PLUGIN_REGISTRY[id]
  if (known) return known.displayName
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
