/**
 * Tests for external package RPC invocations with middleware and permissions
 */

import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export type TestExternalInput = { value: string }
export type TestExternalOutput = { result: string }

export const testExternalWithAuth = pikkuSessionlessFunc<
  TestExternalInput,
  TestExternalOutput
>({
  func: async ({}, data, { rpc }) => {
    const hello = await rpc.invoke('ext:hello', { name: data.value })
    return { result: hello.message }
  },
  internal: true,
})
