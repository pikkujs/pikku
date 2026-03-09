import { z } from 'zod'
import { wireVariable } from '@pikku/core/variable'

export const consoleUrlSchema = z.object({
  url: z.string().describe('The URL where the Pikku Console is running'),
})

wireVariable({
  name: 'pikku_console_url',
  displayName: 'Pikku Console URL',
  description:
    'The URL of the running Pikku Console instance used for rendering workflow screenshots',
  variableId: 'PIKKU_CONSOLE_URL',
  schema: consoleUrlSchema,
})
