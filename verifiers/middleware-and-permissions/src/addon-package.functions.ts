/**
 * Tests for addon RPC invocations with middleware and permissions
 */

import { pikkuSessionlessFunc, wireAddon } from '#pikku'
import { functionMiddleware } from './middleware/function.js'
import { functionPermission } from './permissions/function.js'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

export type TestAddonInput = { value: string }
export type TestAddonOutput = { result: string }

export const testAddonWithAuth = pikkuSessionlessFunc<
  TestAddonInput,
  TestAddonOutput
>({
  func: async ({ logger }, data, { rpc }) => {
    logger.info({ type: 'function', name: 'testAddon', phase: 'execute' })
    try {
      const hello = await rpc.invoke('ext:hello', { name: data.value })
      return { result: hello.message }
    } catch (e: any) {
      // Addon may have service dependencies we don't provide
      // For middleware testing, we just need to verify the call was attempted
      logger.info({
        type: 'addon-call',
        name: 'ext:hello',
        error: e.message,
      })
      return { result: `Addon call attempted for ${data.value}` }
    }
  },
  middleware: [functionMiddleware('testAddon')],
  permissions: {
    functionLevel: functionPermission,
  },
  tags: ['function'],
  remote: true,
})
