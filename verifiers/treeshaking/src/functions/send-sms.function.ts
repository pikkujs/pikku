import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'

export const sendSMS = pikkuFunc<{ to: string; message: string }, void>({
  func: async ({ sms }, data) => {
    await sms.send(data.to, data.message)
  },
})
