import { pikkuService } from '@pikku/core/pikku-service'

export const notifier = pikkuService({
  dev: ({ logger }, env) => ({
    notifier: {
      label: 'dev',
      channel: env.NOTIFY_CHANNEL ?? 'default',
      logger,
    },
  }),
  deploy: ({ logger }, env) => ({
    notifier: {
      label: 'deploy',
      channel: env.NOTIFY_CHANNEL ?? 'default',
      logger,
    },
  }),
})
