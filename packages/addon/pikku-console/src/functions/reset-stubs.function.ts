import { pikkuFunc } from '#pikku'
import { getStubTracker, isTestRun } from '@pikku/core/services'

export const resetStubs = pikkuFunc<null, { enabled: boolean }>({
  title: 'Reset Stubs',
  description:
    'Clears recorded stub calls so the next getStubCalls result is attributable to a single scenario run. Reports enabled: false when the server was not started in test mode.',
  expose: true,
  func: async () => {
    getStubTracker().reset()
    return { enabled: isTestRun() }
  },
})
