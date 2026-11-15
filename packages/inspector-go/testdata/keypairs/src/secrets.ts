import { z } from 'zod'
import { defineSecret } from '@pikku/core/secret'

export const tokenSchema = z.string()

export const generated = defineSecret({
  name: 'SESSION_SALT',
  displayName: 'Session salt',
  secretId: 'session-salt',
  schema: tokenSchema,
  rotationPeriod: 'never',
  generate: { size: 32 },
})
