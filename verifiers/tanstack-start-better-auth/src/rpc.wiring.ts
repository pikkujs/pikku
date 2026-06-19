import { pikkuSessionlessFunc } from '#pikku/function/pikku-function-types.gen.js'
import { wireHTTP } from '#pikku/http/pikku-http-types.gen.js'

export const rpcCaller = pikkuSessionlessFunc<
  { rpcName: string; data?: any },
  any
>({
  auth: false,
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await rpc.exposed(rpcName, data)
  },
})

wireHTTP({
  route: '/rpc/:rpcName',
  method: 'options',
  auth: false,
  func: pikkuSessionlessFunc<{ rpcName: string }>(async () => void 0),
})

wireHTTP({
  route: '/rpc/:rpcName',
  method: 'post',
  auth: false,
  func: rpcCaller,
})
