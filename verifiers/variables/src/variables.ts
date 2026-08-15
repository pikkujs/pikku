import { z } from 'zod'
import { defineVariable } from '#pikku'

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
