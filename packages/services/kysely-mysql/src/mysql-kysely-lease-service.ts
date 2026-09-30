import { KyselyLeaseService } from '@pikku/kysely'
import { mysqlNowMs } from './mysql-now-ms.js'

/** `KyselyLeaseService` on MySQL, with every lease judged on the database's clock. */
export class MySQLKyselyLeaseService extends KyselyLeaseService {
  protected override nowMs() {
    return mysqlNowMs()
  }

  protected override async insertIfAbsent(
    key: string,
    holder: string
  ): Promise<void> {
    await this.db
      .insertInto('pikkuLease')
      .values({ key, holder, token: 0, expiresAt: 0 })
      .orIgnore()
      .execute()
  }
}
