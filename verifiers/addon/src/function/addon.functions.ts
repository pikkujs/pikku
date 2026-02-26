/**
 * Tests for addon RPC invocations
 * Verifies that addon functions can be called via RPC with proper typing
 */

import { pikkuSessionlessFunc, wireAddon } from '#pikku'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

export type TestAddonHelloInput = { name: string; greeting?: string }
export type TestAddonHelloOutput = {
  message: string
  timestamp: number
  noopCalls: number
}

/**
 * Test function that calls addon's hello function via RPC
 */
export const testAddonHello = pikkuSessionlessFunc<
  TestAddonHelloInput,
  TestAddonHelloOutput
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:hello', data)
  },
})
