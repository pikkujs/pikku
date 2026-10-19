import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { WrongCompanyError } from '../../errors.js'

export const LogVisitInput = z.object({
  jobId: z.string(),
  technicianId: z.string(),
  notes: z.string().max(4000).optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
})

export const LogVisitOutput = z.object({ visitId: z.string() })

export const logVisit = pikkuFunc({
  expose: true,
  description: 'Record one attendance at a site.',
  input: LogVisitInput,
  output: LogVisitOutput,
  scopes: ['visits:log'],
  node: { displayName: 'Log Visit', category: 'Jobs', type: 'action' },
  func: async (
    { kysely },
    { jobId, technicianId, notes, startedAt, endedAt },
    { session }
  ) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    const job = await kysely
      .selectFrom('job')
      .select('jobId')
      .where('jobId', '=', jobId)
      .where('companyId', '=', companyId)
      .executeTakeFirst()
    if (!job) throw new WrongCompanyError()

    const visitId = randomUUID()
    await kysely
      .insertInto('visit')
      .values({
        visitId,
        companyId,
        jobId,
        technicianId,
        startedAt: startedAt ?? new Date().toISOString(),
        endedAt: endedAt ?? null,
        notes: notes ?? null,
        createdAt: new Date().toISOString(),
      })
      .execute()

    return { visitId }
  },
})
