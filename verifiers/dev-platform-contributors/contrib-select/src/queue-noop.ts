import type { Contributor } from '@pikku/core/contributors'

const queue = (target: string): Contributor => ({
  provides: ['queueClient'],
  when: (platform) => platform.needsQueue === false,
  run: (services) => {
    services.queueClient = { kind: 'noop', target }
  },
})

export const queueNoopDev = queue('dev')
export const queueNoopDeploy = queue('deploy')
