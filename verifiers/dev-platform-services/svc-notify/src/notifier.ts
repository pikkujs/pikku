import { defineProvider } from '@pikku/core/provider'

export const notifier = defineProvider({
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
