import { addHTTPRoute } from '../.pikku/pikku-types.gen.js'
import { rpcCaller } from './rpc.functions.js'

addHTTPRoute({
  method: 'post',
  route: '/rpc',
  func: rpcCaller,
})
