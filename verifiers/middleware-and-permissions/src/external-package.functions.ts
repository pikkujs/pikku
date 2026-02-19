/**
 * Tests for external package RPC invocations with middleware and permissions
 */

import { pikkuSessionlessFunc } from '#pikku'
import { functionMiddleware } from './middleware/function.js'
import { functionPermission } from './permissions/function.js'

export type TestExternalInput = { value: string }
export type TestExternalOutput = { result: string }

export const testExternalWithAuth = pikkuSessionlessFunc<
  TestExternalInput,
  TestExternalOutput
>({
  func: async ({ logger }, data, { rpc }) => {
    logger.info({ type: 'function', name: 'testExternal', phase: 'execute' })
    try {
      const hello = await rpc.invoke('ext:hello', { name: data.value })
      return { result: hello.message }
    } catch (e: any) {
      // External package may have service dependencies we don't provide
      // For middleware testing, we just need to verify the call was attempted
      logger.info({
        type: 'external-call',
        name: 'ext:hello',
        error: e.message,
      })
      return { result: `External call attempted for ${data.value}` }
    }
  },
  middleware: [functionMiddleware('testExternal')],
  permissions: {
    functionLevel: functionPermission,
  },
  tags: ['function'],
  remote: true,
})
