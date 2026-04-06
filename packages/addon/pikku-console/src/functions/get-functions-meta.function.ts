import { pikkuSessionlessFunc } from '#pikku'
import type { FunctionMeta } from '../services/wiring.service.js'

export const getFunctionsMeta = pikkuSessionlessFunc<null, FunctionMeta[]>({
  title: 'Get Functions Metadata',
  description:
    'Reads function metadata from metaService and returns it as a flat array of FunctionMeta objects (converting from the record/map format using Object.values)',
  expose: true,
  auth: false,
  func: async ({ metaService }) => {
    const functionsMeta = await metaService.getFunctionsMeta()
    return Object.values(functionsMeta)
  },
})
