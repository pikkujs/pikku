import type { Contributor } from '@pikku/core/contributors'

const notifier = (label: string): Contributor => ({
  provides: ['notifier'],
  run: (services, env, _runtime, platform) => {
    services.notifier = {
      label,
      channel: env.NOTIFY_CHANNEL ?? 'default',
      // Plain data the generator inlined once: the same object every `run` gets.
      needsQueue: platform.needsQueue,
      serviceCount: platform.serviceNames.length,
    }
  },
})

export const notifierDev = notifier('dev')
export const notifierDeploy = notifier('deploy')
