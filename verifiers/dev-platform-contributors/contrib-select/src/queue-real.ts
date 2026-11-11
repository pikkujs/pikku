import type { Contributor } from '@pikku/core/contributors'

const queue = (target: string): Contributor => ({
  provides: ['queueClient'],
  when: (platform) => platform.needsQueue === true,
  run: (services) => {
    services.queueClient = { kind: 'real', target }
  },
})

export const queueRealDev = queue('dev')
export const queueRealDeploy = queue('deploy')
