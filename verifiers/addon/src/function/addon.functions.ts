/**
 * Tests for addon RPC invocations
 * Verifies that addon functions can be called via RPC with proper typing
 */

import { pikkuSessionlessFunc } from '#pikku/function'
import { wireAddon } from '#pikku/addon'

/**
 * `mcp` names the tools this app offers, rather than deferring to the addon:
 * `goodbye` never declared itself one, and `hello` — which did — stays out of
 * the menu because the list does not name it.
 */
wireAddon({
  name: 'ext',
  package: '@pikku/templates-function-addon',
  mcp: ['goodbye'],
})

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
