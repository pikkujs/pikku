import { defineSecret } from '#pikku/addon/secrets'
import { z } from 'zod'

export const HmacSecretSchema = z.string().min(32)

defineSecret({
  name: 'altchaHmacSecret',
  displayName: 'ALTCHA signature secret',
  description: 'Signs each challenge so its parameters cannot be altered',
  secretId: 'ALTCHA_HMAC_SECRET',
  schema: HmacSecretSchema,
})

defineSecret({
  name: 'altchaHmacKeySecret',
  displayName: 'ALTCHA key secret',
  description: 'Signs each derived key so verification skips the re-derivation',
  secretId: 'ALTCHA_HMAC_KEY_SECRET',
  schema: HmacSecretSchema,
})
