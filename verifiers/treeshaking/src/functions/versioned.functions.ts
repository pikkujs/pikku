import { pikkuFunc } from '#pikku'

export const analyzeDataV1 = pikkuFunc<{ id: string }, void>({
  override: 'analyzeData',
  version: 1,
  func: async ({ email }, data) => {
    await email.send(data.id, 'analysis', 'v1 result')
  },
})

export const analyzeData = pikkuFunc<{ id: string }, void>({
  func: async ({ analytics, storage }, data) => {
    await analytics.track('analyze', { id: data.id })
    await storage.save(data.id, 'v2 result')
  },
})
