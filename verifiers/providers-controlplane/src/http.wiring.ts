import { wireHTTP } from '#pikku/http'
import { usesDb, usesAi } from './functions.js'

wireHTTP({ auth: false, method: 'get', route: '/db', func: usesDb })
wireHTTP({ auth: false, method: 'get', route: '/ai', func: usesAi })
