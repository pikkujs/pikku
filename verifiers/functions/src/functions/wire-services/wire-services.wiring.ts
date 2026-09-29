import { wireHTTP } from '#pikku/http'
import {
  readsSingletonsOnly,
  readsWireService,
} from './wire-services.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/wire-services/singletons-only',
  func: readsSingletonsOnly,
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/wire-services/wire',
  func: readsWireService,
})
