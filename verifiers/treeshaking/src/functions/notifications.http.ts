import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import { sendEmail } from './send-email.function.js'
import { sendSMS } from './send-sms.function.js'

wireHTTP({
  method: 'post',
  route: '/api/notifications/email',
  tags: ['notifications', 'email'],
  func: sendEmail,
})

wireHTTP({
  method: 'post',
  route: '/api/notifications/sms',
  tags: ['notifications', 'sms'],
  func: sendSMS,
})
