import { KyselyRateLimitService } from '@pikku/addon-kysely'
import { mysqlNowMs } from './mysql-now-ms.js'

/** `KyselyRateLimitService` on MySQL, with every window judged on the database's clock. */
export class MySQLKyselyRateLimitService extends KyselyRateLimitService {
  protected override nowMs() {
    return mysqlNowMs()
  }
}
