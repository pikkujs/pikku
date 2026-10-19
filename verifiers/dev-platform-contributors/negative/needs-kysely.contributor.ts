import type { PlatformServiceContributor } from '@pikku/deploy'

export const needsKysely: PlatformServiceContributor = {
  name: 'needs-kysely',
  needs: ['kysely'],
  emit: () => [`  services.reader = runtime.kysely`],
}
