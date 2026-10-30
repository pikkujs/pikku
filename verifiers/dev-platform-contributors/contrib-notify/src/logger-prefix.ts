import type { Contributor } from '@pikku/core/contributors'

/** Replaces the baseline `logger` the host already holds, which is allowed. */
const loggerPrefix = (label: string): Contributor => ({
  provides: ['logger'],
  run: (services, _env, runtime) => {
    services.logger = { prefix: label, inner: runtime.logger }
  },
})

export const loggerPrefixDev = loggerPrefix('dev')
export const loggerPrefixDeploy = loggerPrefix('deploy')
