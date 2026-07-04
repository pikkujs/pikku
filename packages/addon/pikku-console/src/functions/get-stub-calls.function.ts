import { pikkuFunc } from '#pikku'

export interface StubCallEntry {
  service: string
  method: string
  args: unknown[]
}

export const getStubCalls = pikkuFunc<{ service?: string }, StubCallEntry[]>({
  title: 'Get Stub Calls',
  description:
    'Returns calls recorded against stubbed/spied services (pikkuTestServices). Empty unless the server was started in test mode (pikku dev --test or --coverage).',
  expose: true,
  func: async ({ stubTracker }, data) => {
    if (!stubTracker) return []
    return stubTracker.getCalls(data?.service ?? undefined)
  },
})
