import { wireHTTP } from '#pikku/http'
import { addPassage, nearestPassages } from './passages.functions.js'

wireHTTP({
  auth: false,
  route: '/passages',
  method: 'post',
  func: addPassage,
})

wireHTTP({
  auth: false,
  route: '/passages/nearest',
  method: 'post',
  func: nearestPassages,
})
