import { wireHTTP } from '#pikku/http'
import { usesDb, usesAi, plain } from './functions.js'

wireHTTP({ auth: false, method: 'get', route: '/db', func: usesDb })
wireHTTP({ auth: false, method: 'get', route: '/ai', func: usesAi })
wireHTTP({ auth: false, method: 'get', route: '/plain', func: plain })
