import { wireHTTP } from '#pikku/http'
import { liveReport } from './report.functions.js'

wireHTTP({
  method: 'get',
  route: '/report',
  func: liveReport,
  auth: false,
})
