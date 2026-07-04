import { pikkuFunc } from '#pikku'

export const resetStubs = pikkuFunc<null, { enabled: boolean }>({
  title: 'Reset Stubs',
  description:
    'Clears recorded stub calls so the next getStubCalls result is attributable to a single scenario run. Reports enabled: false when the server was not started in test mode.',
  expose: true,
  func: async ({ stubTracker }) => {
    if (!stubTracker) return { enabled: false }
    stubTracker.reset()
    return { enabled: true }
  },
})
