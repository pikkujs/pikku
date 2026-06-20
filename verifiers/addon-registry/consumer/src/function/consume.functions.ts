/**
 * Consumes the registry verifier addon — installed from the npm-pack artifact,
 * not the workspace source — and calls its `hello` function over RPC.
 */
import { pikkuSessionlessFunc, wireAddon } from '#pikku'

wireAddon({ name: 'ext', package: '@pikku/verifier-registry-addon' })

export type ConsumeHelloInput = { name: string; greeting?: string }
export type ConsumeHelloOutput = {
  message: string
  timestamp: number
  noopCalls: number
}

export const consumeHello = pikkuSessionlessFunc<
  ConsumeHelloInput,
  ConsumeHelloOutput
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:hello', data)
  },
})
