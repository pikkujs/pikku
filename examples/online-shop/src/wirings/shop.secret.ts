import { z } from 'zod'
import { defineSecret } from '#pikku/secrets/pikku-secret-types.gen.js'

// @snippet start secrets
// BETTER_AUTH_SECRET is not declared here — the CLI generates its defineSecret
// into src/scaffold/auth/ from the pikkuBetterAuth config, along with one per
// configured provider.
export const StripeKeySchema = z.string()

defineSecret({
  name: 'stripeSecretKey',
  displayName: 'Stripe Secret Key',
  description: 'Stripe secret key (optional — only needed for real payments)',
  secretId: 'STRIPE_SECRET_KEY',
  schema: StripeKeySchema,
})
// @snippet end secrets
