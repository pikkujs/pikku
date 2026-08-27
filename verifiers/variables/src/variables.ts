import { z } from 'zod'
import { defineVariable } from '#pikku/variables'

export const serverConfigSchema = z.object({
  host: z.string().describe('Server hostname'),
  port: z.coerce.number().describe('Server port'),
})

defineVariable({
  name: 'server-config',
  displayName: 'Server Config',
  description: 'Non-sensitive server configuration',
  variableId: 'SERVER_CONFIG',
  schema: serverConfigSchema,
})

export const apiBaseUrlSchema = z
  .enum(['https://api.example.com'])
  .default('https://api.example.com')

defineVariable({
  name: 'api-base-url',
  displayName: 'API Base URL',
  description: 'Where the API lives. There is only one, so it defaults.',
  variableId: 'API_BASE_URL',
  schema: apiBaseUrlSchema,
})
