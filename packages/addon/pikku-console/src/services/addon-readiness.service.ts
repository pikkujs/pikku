import type { SecretService } from '@pikku/core/services'
import type { VariablesService } from '@pikku/core/services'
import {
  checkAddonReadiness,
  type AddonReadiness,
} from '../lib/addon-readiness.js'
import type { InstanceOverrides } from '../lib/derive-instance-overrides.js'

/**
 * Function bodies are handed services without `secrets`, so the presence check
 * an addon install needs lives here, holding the host's secrets and variables.
 */
export class AddonReadinessService {
  constructor(
    private secrets: SecretService,
    private variables: VariablesService
  ) {}

  async check(
    rootDir: string,
    packageName: string,
    overrides: InstanceOverrides = {}
  ): Promise<AddonReadiness> {
    return checkAddonReadiness(
      { secrets: this.secrets, variables: this.variables },
      rootDir,
      packageName,
      overrides
    )
  }
}
