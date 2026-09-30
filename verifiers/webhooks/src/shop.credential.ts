import { z } from 'zod'
import { defineCredential } from '#pikku/auth'

defineCredential({
  name: 'shopWebhookSecret',
  displayName: 'Shop webhook secret',
  description: 'Signs the shop webhook source; stored by its setup',
  type: 'singleton',
  schema: z.string(),
})
