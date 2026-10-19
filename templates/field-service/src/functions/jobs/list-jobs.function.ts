import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { JobStatus, JobSummary } from '../../lib/job-schemas.js'

export const ListJobsInput = z.object({
  status: JobStatus.optional(),
  technicianId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  /** The `nextCursor` of the previous page. Absent means the first page. */
  cursor: z.string().optional(),
})

/**
 * `nextCursor` is not decoration.
 *
 * The CLI generates `usePikkuInfiniteQuery` only for RPCs whose output carries
 * a `nextCursor` field, so the shape of this schema is what decides whether the
 * frontend gets an infinite-scroll hook at all.
 */
export const ListJobsOutput = z.object({
  jobs: z.array(JobSummary),
  nextCursor: z.string().nullable(),
})

export const listJobs = pikkuFunc({
  expose: true,
  description: 'List jobs for the caller’s company, newest first.',
  input: ListJobsInput,
  output: ListJobsOutput,
  scopes: ['jobs:read'],
  node: { displayName: 'List Jobs', category: 'Jobs', type: 'action' },
  func: async (
    { kysely },
    { status, technicianId, limit = 20, cursor },
    { session }
  ) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    let query = kysely
      .selectFrom('job')
      .innerJoin('customer', 'customer.customerId', 'job.customerId')
      .leftJoin('technician', 'technician.technicianId', 'job.technicianId')
      .select([
        'job.jobId',
        'job.title',
        'job.status',
        'job.priority',
        'job.scheduledFor',
        'job.createdAt',
        'customer.name as customerName',
        'technician.name as technicianName',
      ])
      // The tenant predicate is on the query, not on the result. Filtering
      // after the fact reads every other company's rows into this process
      // first, which is a leak whether or not anything is returned.
      .where('job.companyId', '=', companyId)
      .orderBy('job.createdAt', 'desc')
      .orderBy('job.jobId', 'desc')

    if (status) query = query.where('job.status', '=', status)
    if (technicianId) query = query.where('job.technicianId', '=', technicianId)
    // Keyset, not offset: a job raised while the dispatcher is scrolling
    // shifts every offset by one and makes a row appear twice.
    if (cursor) query = query.where('job.createdAt', '<', cursor)

    const rows = await query.limit(limit + 1).execute()
    const page = rows.slice(0, limit)
    const last = page[page.length - 1]

    return {
      jobs: page.map((r) => ({
        jobId: r.jobId,
        title: r.title,
        status: r.status,
        priority: r.priority,
        scheduledFor: r.scheduledFor,
        customerName: r.customerName,
        technicianName: r.technicianName,
      })),
      nextCursor: rows.length > limit && last ? last.createdAt : null,
    }
  },
})
