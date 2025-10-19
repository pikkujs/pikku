import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'

export const sendEmail = pikkuFunc<
  { to: string; subject: string; body: string },
  void
>({
  func: async ({ email }, data) => {
    await email.send(data.to, data.subject, data.body)
  },
})
