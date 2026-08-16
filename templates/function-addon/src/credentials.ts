import { z } from 'zod'
import { defineSecret } from '#pikku/secrets'

export const exampleCredentialsSchema = z.object({
  apiKey: z.string().describe('API key for external service'),
  apiSecret: z.string().describe('API secret for authentication'),
  endpoint: z.url().optional().describe('Optional custom endpoint URL'),
})

defineSecret({
  name: 'example-api',
  displayName: 'Example API Credentials',
  description: 'Credentials for the example external API',
  secretId: 'EXAMPLE_API_CREDENTIALS',
  schema: exampleCredentialsSchema,
})
