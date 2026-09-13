import { CachedFlagSource } from '@pikku/core/flag'
import type { FlagConfigSnapshot } from '@pikku/core/flag'
import type { FeatureFlagSource } from '@pikku/core/services'

/**
 * A read-only source, which is all a third-party provider can honestly be —
 * PostHog and Unleash own the switch, so there is nothing for `setEnabled` to
 * write to.
 *
 * Wiring one proves the runner gate needs `snapshot()` and nothing else: the
 * store half exists for backings Pikku owns, and requiring it would shut every
 * external provider out of the primitive.
 */
export class RemoteFlagSource
  extends CachedFlagSource
  implements FeatureFlagSource
{
  public served: FlagConfigSnapshot = {}
  public failing = false

  protected async fetchSnapshot(): Promise<FlagConfigSnapshot> {
    if (this.failing) {
      throw new Error('provider unreachable')
    }
    return this.served
  }
}
