import type { PlatformServiceContributor } from '@pikku/deploy'

export const logReader: PlatformServiceContributor = {
  name: 'log-reader',
  needs: ['logSources.workspace'],
  emit: () => [`  services.logReader = services.logSources.workspace`],
}
