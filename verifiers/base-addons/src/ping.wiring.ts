import { wireHTTP } from '#pikku/http'
import { ping } from './functions/ping.functions.js'

wireHTTP({ method: 'get', route: '/ping', func: ping, auth: false })
