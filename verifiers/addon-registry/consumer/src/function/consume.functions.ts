/**
 * Consumes the registry verifier addon — installed from the npm-pack artifact,
 * not the workspace source — and calls its `hello` function over RPC through
 * the `ext:` namespace that `wireAddon` sets up.
 */
import { pikkuSessionlessFunc, wireAddon, wireHTTP } from '#pikku'

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

// Wire to HTTP so codegen registers the function (name + meta), which lets the
// runtime verifier invoke it and exercise the real `ext:hello` namespace path.
wireHTTP({
  route: '/consume-hello',
  method: 'post',
  auth: false,
  func: consumeHello,
})
