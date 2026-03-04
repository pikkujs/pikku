import { EmailStore } from './email-store.service.js'
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(async () => {
  const emailStore = new EmailStore()
  return { emailStore }
})
