import { KyselyLockService } from '@pikku/kysely'
import { pgNowMs } from './pg-now-ms.js'

/** `KyselyLockService` with every lease judged on the database's clock. */
export class PgKyselyLockService extends KyselyLockService {
  protected override nowMs() {
    return pgNowMs()
  }
}
