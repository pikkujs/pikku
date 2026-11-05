import { pikkuFunc } from './core.js'

export const gatedInBody = pikkuFunc({
  expose: true,
  permissionsInBody: true,
  func: async () => undefined,
})
