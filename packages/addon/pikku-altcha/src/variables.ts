import { defineVariable } from '#pikku/addon/variables'
import { z } from 'zod'

export const AltchaCostSchema = z.coerce.number().int().min(100).max(1_000_000)

defineVariable({
  name: 'altchaCost',
  displayName: 'ALTCHA cost',
  description:
    'PBKDF2 iterations per attempt, which sets how long the widget works. The default of 5000 takes about two to three seconds on a desktop browser; raise it to slow bots further, lower it for slow devices.',
  variableId: 'ALTCHA_COST',
  schema: AltchaCostSchema,
  optional: true,
})
