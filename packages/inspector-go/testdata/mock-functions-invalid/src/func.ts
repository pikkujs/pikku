import { pikkuFunc } from './core.js'

// Both a body and the marker: the type rejects it, and so does the build.
export const mockedAndImplemented = pikkuFunc<{ id: string }, string>({
  mock: true,
  // @ts-expect-error a mocked function has no body
  func: async () => 'body',
})
