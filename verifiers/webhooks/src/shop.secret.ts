import { z } from 'zod'
import { defineSecret } from '#pikku/secrets/pikku-secret-types.gen.js'

export const ShopWebhookSecretSchema = z.string()

defineSecret({
  name: 'shopWebhookSecret',
  displayName: 'Shop webhook secret',
  description: 'Signs the shop webhook source; produced by its setup',
  secretId: 'SHOP_WEBHOOK_SECRET',
  schema: ShopWebhookSecretSchema,
})
