import { addHTTPRoute } from '../.pikku/pikku-types.gen.js'
import { rpcCaller, rpcTest } from './rpc.functions.js'

addHTTPRoute({
  auth: false,
  method: 'get',
  route: '/rpc',
  func: rpcCaller,
})

addHTTPRoute({
  auth: false,
  method: 'get',
  route: '/dummy',
  func: rpcTest,
})
