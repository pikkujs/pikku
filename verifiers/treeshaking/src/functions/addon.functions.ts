/**
 * Tests for addon RPC invocations with treeshaking
 */

import { pikkuSessionlessFunc, wireAddon } from '#pikku'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

export type TestAddonInput = { value: string }
export type TestAddonOutput = { result: string }

export const testAddon = pikkuSessionlessFunc<TestAddonInput, TestAddonOutput>({
  func: async (_, data, { rpc }) => {
    const hello = await rpc.invoke('ext:hello', { name: data.value })
    return { result: hello.message }
  },
  remote: true,
})
