import { wireHTTP } from '#pikku/http'
import { countNotes } from './notes.functions.js'

wireHTTP({
  auth: false,
  route: '/notes/count',
  method: 'get',
  func: countNotes,
})
