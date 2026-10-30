import type { Contributor } from '@pikku/core/contributors'

/**
 * Keeps the services bag it was handed and reads `cache` from it later. It does
 * not need `cache`, so it may run first: it only sees the value if `run` got the
 * live bag rather than a copy.
 */
const blob = (label: string): Contributor => ({
  provides: ['blob'],
  onServerStart: (services) => {
    services.events.push('start:blob')
  },
  onServerStop: (services) => {
    services.events.push('stop:blob')
  },
  run: (services) => {
    services.events ??= []
    services.blob = { label, readCache: () => services.cache }
  },
})

export const blobDev = blob('dev')
export const blobDeploy = blob('deploy')
