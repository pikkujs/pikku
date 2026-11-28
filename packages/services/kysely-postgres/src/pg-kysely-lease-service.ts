import { KyselyLeaseService } from '@pikku/kysely'
import { pgNowMs } from './pg-now-ms.js'

/** `KyselyLeaseService` with every lease judged on the database's clock. */
export class PgKyselyLeaseService extends KyselyLeaseService {
  protected override nowMs() {
    return pgNowMs()
  }
}
