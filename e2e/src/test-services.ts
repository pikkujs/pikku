import {
  pikkuTestServices,
  pikkuTestWireServices,
} from '#pikku/pikku-types.gen.js'
import type { EmailService } from '@pikku/core/services'
import type { Kysely } from 'kysely'

// Better Auth's user table lives outside KyselyPikkuDB
type BetterAuthTables = { user: { id: string; email: string } }

export const createTestServices = pikkuTestServices(
  async (_services, { stub }) => ({
    emailService: stub<EmailService>('emailService', {
      send: async () => ({ messageId: 'stubbed-message' }),
    }),
  })
)

export const createTestWireServices = pikkuTestWireServices(
  async (services, wire, { stub }) => {
    const session = wire.session
    if (!session?.actor || !session.userId) {
      return {}
    }
    const kysely = services.kysely as unknown as Kysely<BetterAuthTables>
    const user = await kysely
      .selectFrom('user')
      .where('id', '=', String(session.userId))
      .select(['email'])
      .executeTakeFirst()
    if (user?.email === 'support@actors.local') {
      return {
        emailService: stub<EmailService>('emailService', {
          send: async () => {
            throw new Error('smtp relay declined for support actor')
          },
        }),
      }
    }
    return {}
  }
)
