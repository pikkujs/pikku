import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { projectChecks } from '../lib/project-checks.js'

export const FabricProjectChecksFinding = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})

export const FabricProjectChecksInput = z.object({
  root: z.string(),
  migrationsDir: z.string().optional(),
  deployTarget: z.string().optional(),
})

export const FabricProjectChecksOutput = z.array(FabricProjectChecksFinding)

export const FabricProjectChecks = pikkuSessionlessFunc({
  description:
    'The checks that need the Fabric project: migration drift against its stages and the link findings.',
  input: FabricProjectChecksInput,
  output: FabricProjectChecksOutput,
  func: async (_services, request) => projectChecks(request),
})
