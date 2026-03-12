import { wireCredential } from '@pikku/core/credential'
import { z } from 'zod'

export const HmacKeySchema = z.object({ secretKey: z.string() })

wireCredential({
  name: 'hmac-key',
  displayName: 'HMAC Signing Key',
  type: 'wire',
  schema: HmacKeySchema,
})
