import { defineCredential } from '@pikku/core/credential'
import { z } from 'zod'

export const HmacKeySchema = z.object({ secretKey: z.string() })

defineCredential({
  name: 'hmac-key',
  displayName: 'HMAC Signing Key',
  type: 'wire',
  schema: HmacKeySchema,
})
