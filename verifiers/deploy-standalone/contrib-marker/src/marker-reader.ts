import type { Contributor } from '@pikku/core/contributors'

/** Needs what `marker` provides, so it runs after it. */
export const markerReaderDeploy: Contributor = {
  provides: ['platformMarkerSeen'],
  needs: ['platformMarker'],
  run: (services) => {
    services.platformMarkerSeen =
      services.platformMarker.from === 'wireAddon.contributors'
  },
}
