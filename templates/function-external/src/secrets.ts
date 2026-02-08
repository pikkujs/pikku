import { z } from 'zod'
import { wireSecret } from '../.pikku/pikku-types.gen.js'

export const exampleSecretsSchema = z.object({
  apiKey: z.string().describe('API key for external service'),
  apiSecret: z.string().describe('API secret for authentication'),
  endpoint: z.url().optional().describe('Optional custom endpoint URL'),
})

wireSecret({
  name: 'example-api',
  displayName: 'Example API',
  description: 'Secrets for the example external API',
  secretId: 'EXAMPLE_API_SECRETS',
  schema: exampleSecretsSchema,
})
