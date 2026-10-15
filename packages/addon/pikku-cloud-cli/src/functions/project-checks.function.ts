import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { projectChecks } from '../lib/project-checks.js'

export const CloudProjectChecksFinding = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})

export const CloudProjectChecksInput = z.object({
  root: z.string(),
  migrationsDir: z.string().optional(),
  deployTarget: z.string().optional(),
})

export const CloudProjectChecksOutput = z.array(CloudProjectChecksFinding)

export const CloudProjectChecks = pikkuSessionlessFunc({
  description:
    'The checks that need a Pikku Studio Cloud project: migration drift against its stages and the link findings.',
  input: CloudProjectChecksInput,
  output: CloudProjectChecksOutput,
  func: async (_services, request) => projectChecks(request),
})
