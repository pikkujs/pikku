import { KyselyRateLimitService } from '@pikku/kysely'
import { pgNowMs } from './pg-now-ms.js'

/** `KyselyRateLimitService` with every window judged on the database's clock. */
export class PgKyselyRateLimitService extends KyselyRateLimitService {
  protected override nowMs() {
    return pgNowMs()
  }
}
