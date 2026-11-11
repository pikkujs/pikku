import type { Contributor } from '@pikku/core/contributors'

const cache = (label: string): Contributor => ({
  provides: ['cache'],
  onServerStart: (services) => {
    services.events.push('start:cache')
  },
  onServerStop: (services) => {
    services.events.push('stop:cache')
  },
  run: (services) => {
    services.cache = { label }
    services.events ??= []
  },
})

export const cacheDev = cache('dev')
export const cacheDeploy = cache('deploy')
