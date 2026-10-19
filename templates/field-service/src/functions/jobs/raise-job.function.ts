import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { WrongCompanyError } from '../../errors.js'
import { JobPriority } from '../../lib/job-schemas.js'

export const RaiseJobInput = z.object({
  customerId: z.string(),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  priority: JobPriority.optional(),
})

export const RaiseJobOutput = z.object({
  jobId: z.string(),
  status: z.string(),
})

export const raiseJob = pikkuFunc({
  expose: true,
  description: 'Raise a new job against one of the company’s customers.',
  input: RaiseJobInput,
  output: RaiseJobOutput,
  scopes: ['jobs:write'],
  node: { displayName: 'Raise Job', category: 'Jobs', type: 'trigger' },
  func: async (
    { kysely, auditLog },
    { customerId, title, description, priority = 'normal' },
    { session }
  ) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    // The customer id is caller-supplied, so it is re-read under the caller's
    // own tenant before it is written into a row. Trusting it would let anyone
    // file a job against another company's site.
    const customer = await kysely
      .selectFrom('customer')
      .select('customerId')
      .where('customerId', '=', customerId)
      .where('companyId', '=', companyId)
      .executeTakeFirst()
    if (!customer) throw new WrongCompanyError()

    const jobId = randomUUID()
    const now = new Date().toISOString()

    await kysely
      .insertInto('job')
      .values({
        jobId,
        companyId,
        customerId,
        technicianId: null,
        title,
        description: description ?? null,
        status: 'new',
        priority,
        scheduledFor: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    await auditLog.write({
      type: 'job.raised',
      source: 'explicit',
      metadata: { jobId, companyId, priority },
    })

    return { jobId, status: 'new' }
  },
})
