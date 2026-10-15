import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { linkedProjectId } from '../lib/changes-backend.js'

export const CloudChangesProjectInput = z.object({
  projectId: z.string().optional(),
})

export const CloudChangesProjectOutput = z.object({
  projectId: z.string().nullable(),
})

export const CloudChangesProject = pikkuSessionlessFunc({
  description:
    'The Pikku Studio Cloud project this checkout keeps its changes in, or null when they are local.',
  input: CloudChangesProjectInput,
  output: CloudChangesProjectOutput,
  func: async (_services, { projectId }) => ({
    projectId: await linkedProjectId(projectId),
  }),
})
