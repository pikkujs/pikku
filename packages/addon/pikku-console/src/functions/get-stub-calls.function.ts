import { pikkuFunc } from '#pikku'
import { getStubTracker } from '@pikku/core/services'

export interface StubCallEntry {
  service: string
  method: string
  args: unknown[]
}

export const getStubCalls = pikkuFunc<{ service?: string }, StubCallEntry[]>({
  title: 'Get Stub Calls',
  description:
    'Returns calls recorded against stubbed/spied services (via the stub()/spy() core utils). Empty unless the server records service calls (pikku dev --test).',
  expose: true,
  func: async (_services, data) => {
    return getStubTracker().getCalls(data?.service ?? undefined)
  },
})
