/**
 * Tests for external package RPC invocations with treeshaking
 */

import { pikkuSessionlessFunc } from '#pikku'

export type TestExternalInput = { value: string }
export type TestExternalOutput = { result: string }

export const testExternal = pikkuSessionlessFunc<
  TestExternalInput,
  TestExternalOutput
>({
  func: async (_, data, { rpc }) => {
    const hello = await rpc.invoke('ext:hello', { name: data.value })
    return { result: hello.message }
  },
  internal: true,
})
