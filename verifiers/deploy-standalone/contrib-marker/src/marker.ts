import type { Contributor } from '@pikku/core/contributors'

/** Needs the entry's own logger; the adapter widened the platform with the unit. */
export const markerDeploy: Contributor = {
  provides: ['platformMarker'],
  needs: ['logger'],
  run: (services, _env, runtime, platform) => {
    services.platformMarker = {
      from: 'wireAddon.contributors',
      logger: runtime.logger,
      // The adapter widened the platform with the unit being built.
      unit: (platform as any).unit?.name,
    }
  },
}
