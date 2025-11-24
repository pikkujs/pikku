/**
 * Tests for external package RPC invocations
 * Verifies that external package functions can be called via RPC with proper typing
 */

import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export type TestExternalHelloInput = { name: string; greeting?: string }
export type TestExternalHelloOutput = {
  message: string
  timestamp: number
  noopCalls: number
}

/**
 * Test function that calls external package's hello function via RPC
 */
export const testExternalHello = pikkuSessionlessFunc<
  TestExternalHelloInput,
  TestExternalHelloOutput
>({
  func: async ({}, data, { rpc }) => {
    // Call external package function via RPC namespace
    return await rpc.invoke('ext:hello', data)
  },
  internal: true,
})

/**
 * Test function that calls external package's hello function via RPC
 */
export const testBrokenRPCCall = pikkuSessionlessFunc<void, void>({
  func: async ({}, data, { rpc }) => {
    // @ts-expect-error Testing broken RPC call
    return await rpc.invoke('notexisint:hello', data)
  },
  internal: true,
})
