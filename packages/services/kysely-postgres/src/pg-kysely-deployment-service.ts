import { KyselyDeploymentService } from '@pikku/kysely'
import { sql } from 'kysely'

const INIT_LOCK_ID = 2147483646

export class PgKyselyDeploymentService extends KyselyDeploymentService {
  public async init(): Promise<void> {
    await sql`SELECT pg_advisory_lock(${INIT_LOCK_ID})`.execute(this.db)
    try {
      await super.init()
    } finally {
      await sql`SELECT pg_advisory_unlock(${INIT_LOCK_ID})`.execute(this.db)
    }
  }
}
