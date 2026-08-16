import { defineSecret } from '#pikku/secrets'
import { z } from 'zod'

export const EmailsPromoCredentialsSchema = z.string()

// The project secret the `emails-promo` instance remaps EMAILS_CREDENTIALS to.
// An override target is a secret of the HOST, not of the addon: the whole point
// of remapping is that this instance reads a credential the addon never
// declared, so the project has to declare it or nothing can grant it.
defineSecret({
  name: 'emailsPromoCredentials',
  displayName: 'Promo Emails API',
  description: 'Credentials the promotional email instance delivers with',
  secretId: 'EMAILS_PROMO_CREDENTIALS',
  schema: EmailsPromoCredentialsSchema,
})
