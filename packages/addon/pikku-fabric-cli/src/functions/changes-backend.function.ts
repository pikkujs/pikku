import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { linkedProjectId } from '../lib/changes-backend.js'

export const FabricChangesProjectInput = z.object({
  projectId: z.string().optional(),
})

export const FabricChangesProjectOutput = z.object({
  projectId: z.string().nullable(),
})

export const FabricChangesProject = pikkuSessionlessFunc({
  description:
    'The Fabric project this checkout keeps its changes in, or null when they are local.',
  input: FabricChangesProjectInput,
  output: FabricChangesProjectOutput,
  func: async (_services, { projectId }) => ({
    projectId: await linkedProjectId(projectId),
  }),
})
