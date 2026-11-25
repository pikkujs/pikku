import { wireHTTP } from '#pikku/http'
import { usesDb, usesAi, plain, serverJob } from './functions.js'

wireHTTP({ auth: false, method: 'get', route: '/db', func: usesDb })
wireHTTP({ auth: false, method: 'get', route: '/ai', func: usesAi })
wireHTTP({ auth: false, method: 'get', route: '/plain', func: plain })
wireHTTP({
  auth: false,
  method: 'get',
  route: '/db-server',
  func: serverJob,
})
