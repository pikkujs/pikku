import { defineCredential } from '@pikku/core/credential'
import { z } from 'zod'

export const ShippingProviderSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

/**
 * The shop's connection to its shipping carrier.
 *
 * `type: 'singleton'` because the shop connects once, as a business — every
 * order ships through the same carrier account. A per-user credential is the
 * other shape: it would be right for staff linking their *own* account to
 * something, where each person's token is their own.
 *
 * The OAuth2 block is what lets the console show a "Connect" button and run the
 * authorization-code round trip, rather than someone pasting a token into an
 * environment variable and nobody knowing when it expires.
 */
// @snippet start shopCredential
defineCredential({
  name: 'shipping-provider',
  displayName: 'Shipping Provider',
  description: 'OAuth2 connection to the carrier that ships orders',
  type: 'singleton',
  schema: ShippingProviderSchema,
  oauth2: {
    appCredentialSecretId: 'SHIPPING_APP_CREDENTIAL',
    tokenSecretId: 'SHIPPING_TOKENS',
    // These must be literals. The inspector captures the oauth2 block verbatim
    // into the generated meta — it does not evaluate expressions — and that
    // meta is merged into the consuming app's config. A `${...}` template would
    // serialize as broken source text rather than a URL.
    authorizationUrl: 'https://carrier.example.com/oauth/authorize',
    tokenUrl: 'https://carrier.example.com/oauth/token',
    scopes: ['shipments:write'],
  },
})
// @snippet end shopCredential
