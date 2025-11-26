import { z } from 'zod'
import { wireForgeCredential } from '../.pikku/pikku-types.gen.js'

export const exampleCredentialsSchema = z.object({
  apiKey: z.string().describe('API key for external service'),
  apiSecret: z.string().describe('API secret for authentication'),
  endpoint: z.url().optional().describe('Optional custom endpoint URL'),
})

wireForgeCredential({
  name: 'example-api',
  displayName: 'Example API Credentials',
  description: 'Credentials for the example external API',
  secretId: 'EXAMPLE_API_CREDENTIALS',
  schema: exampleCredentialsSchema,
})
