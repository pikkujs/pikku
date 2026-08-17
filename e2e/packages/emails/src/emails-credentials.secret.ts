import { defineSecret } from '#pikku/secrets'
import { z } from 'zod'

export const EmailsCredentialsSchema = z.string()

// The delivery credential this addon needs. Two instances of this package must
// not share it, so instances remap this logical name through `secretOverrides`
// — which is what the console's instance selector resolves against.
defineSecret({
  name: 'emailsCredentials',
  displayName: 'Emails API',
  description: 'Credentials for the email delivery provider',
  secretId: 'EMAILS_CREDENTIALS',
  schema: EmailsCredentialsSchema,
})
