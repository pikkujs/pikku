import { wireForgeNode, wireForgeCredential } from '@pikku/core'
import { z } from 'zod'

// Example credential declaration for this package
// The schema defines the structure of the secret stored in SecretService
export const exampleCredentialsSchema = z.object({
  apiKey: z.string().describe('API key for external service'),
  apiSecret: z.string().describe('API secret for authentication'),
  endpoint: z
    .string()
    .url()
    .optional()
    .describe('Optional custom endpoint URL'),
})

wireForgeCredential({
  name: 'example-api',
  displayName: 'Example API Credentials',
  description: 'Credentials for the example external API',
  secretId: 'EXAMPLE_API_CREDENTIALS',
  schema: exampleCredentialsSchema,
})

// Forge node for the hello function
wireForgeNode({
  name: 'hello',
  displayName: 'Say Hello',
  category: 'Communication',
  type: 'action',
  rpc: 'hello',
  description: 'Sends a friendly greeting message',
  tags: ['external'],
})

// Forge node for the goodbye function
wireForgeNode({
  name: 'goodbye',
  displayName: 'Say Goodbye',
  category: 'Communication',
  type: 'end',
  rpc: 'goodbye',
  description: 'Sends a farewell message',
  tags: ['external'],
})
