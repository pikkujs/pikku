import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import { processPayment } from './process-payment.function.js'

wireHTTP({
  method: 'post',
  route: '/api/payments/charge',
  tags: ['payments'],
  func: processPayment,
})
