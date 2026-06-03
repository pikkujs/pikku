import { pikkuFunc } from '#pikku'

export const processNotificationQueue = pikkuFunc<{ kind: string }, void>({
  func: async ({ notification }, data) => {
    await notification.send(data.kind)
  },
})

export const runNotificationSweep = pikkuFunc<void, void>({
  func: async ({ notification }) => {
    await notification.send('sweep')
  },
})
