import {
  pikkuTestServices,
  pikkuTestWireServices,
} from '#pikku/pikku-types.gen.js'
import type { EmailService } from '@pikku/core/services'
import type { Kysely } from 'kysely'

// Better Auth owns its own user table (outside KyselyPikkuDB) — type just the
// columns this factory reads, mirroring the impersonation loadUser in
// middleware.ts.
type BetterAuthTables = { user: { id: string; email: string } }

/**
 * Declared test stubs — only activated under `pikku serve --test` (or
 * `--coverage`, which implies it). The e2e suite has no SMTP relay, so the
 * email service is a recording stub scenarios can assert against via
 * workflow.expectService().
 */
export const createTestServices = pikkuTestServices(
  async (_services, { stub }) => ({
    emailService: stub<EmailService>('emailService', {
      send: async () => ({ messageId: 'stubbed-message' }),
    }),
  })
)

/**
 * Per-invocation fault injection: the support actor's email relay always
 * declines, so scenarios can walk error branches (workflow.expectError)
 * without polluting the happy path for other actors.
 */
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
