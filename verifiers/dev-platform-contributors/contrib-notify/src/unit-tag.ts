import type { Contributor, ContributorPlatform } from '@pikku/core/contributors'

/**
 * Reads the one fact only a deploy has. The host widens `ContributorPlatform`
 * with `unit`; a contributor that wants it declares the wider type, and `when`
 * keeps it out of every target that does not supply it (`pikku dev`).
 */
type WithUnit = ContributorPlatform & { unit?: { name: string } }

export const unitTagDeploy: Contributor<Record<string, any>, WithUnit> = {
  provides: ['unitTag'],
  when: (platform) => platform.unit !== undefined,
  run: (services, _env, _runtime, platform) => {
    services.unitTag = platform.unit!.name
  },
}
