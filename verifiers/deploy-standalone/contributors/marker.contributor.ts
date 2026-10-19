import type { PlatformServiceContributor } from '@pikku/deploy'

export const markerReader: PlatformServiceContributor = {
  name: 'marker-reader',
  needs: ['platformMarker'],
  emit: () => [
    `  services.platformMarkerSeen = services.platformMarker.from === 'deploy.contributors'`,
  ],
}

export const marker: PlatformServiceContributor = {
  name: 'marker',
  needs: ['logger'],
  provides: ['platformMarker'],
  emit: () => [
    `  services.platformMarker = { from: 'deploy.contributors', logger: runtime.logger }`,
  ],
}
