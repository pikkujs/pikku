import { z } from 'zod'
import { defineSecret } from '@pikku/core/secret'

// Not a golden fixture (no pikku.config.json): schema generation needs the real
// zod at runtime, and this only checks what the visitor reads. `zod` here is a
// stand-in under node_modules, so no install is needed.
export const tokenSchema = z.string()

export const generated = defineSecret({
  name: 'SESSION_SALT',
  displayName: 'Session salt',
  secretId: 'session-salt',
  schema: tokenSchema,
  rotationPeriod: 'never',
  generate: { size: 32 },
})
