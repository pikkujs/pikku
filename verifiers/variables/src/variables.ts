import { z } from 'zod'
import { wireVariable } from '@pikku/core/variable'

export const serverConfigSchema = z.object({
  host: z.string().describe('Server hostname'),
  port: z.coerce.number().describe('Server port'),
})

wireVariable({
  name: 'server-config',
  displayName: 'Server Config',
  description: 'Non-sensitive server configuration',
  variableId: 'SERVER_CONFIG',
  schema: serverConfigSchema,
})
