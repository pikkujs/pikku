// Ensure HTTP metadata is loaded before calling wireHTTP
import '../.pikku/http/pikku-http-wirings-meta.gen.js'

import { wireHTTP } from '#pikku/http'
import { fanOut, health, listItems, submitContact } from './functions.js'

wireHTTP({ method: 'get', route: '/items', func: listItems, auth: false })
wireHTTP({
  method: 'post',
  route: '/contact',
  func: submitContact,
  auth: false,
})
wireHTTP({ method: 'get', route: '/health', func: health, auth: false })
wireHTTP({ method: 'post', route: '/fan-out', func: fanOut, auth: false })
