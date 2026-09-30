import { KyselyLockService } from '@pikku/kysely'
import { mysqlNowMs } from './mysql-now-ms.js'

/** `KyselyLockService` on MySQL, with every lease judged on the database's clock. */
export class MySQLKyselyLockService extends KyselyLockService {
  protected override nowMs() {
    return mysqlNowMs()
  }

  protected override async insertIfAbsent(
    key: string,
    holder: string
  ): Promise<void> {
    await this.db
      .insertInto('pikkuLock')
      .values({ key, holder, token: 0, expiresAt: 0 })
      .orIgnore()
      .execute()
  }
}
