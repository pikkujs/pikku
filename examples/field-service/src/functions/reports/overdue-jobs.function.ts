import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'

export const OverdueJobsOutput = z.object({
  overdue: z.array(
    z.object({
      jobId: z.string(),
      title: z.string(),
      scheduledFor: z.string(),
      technicianName: z.string().nullable(),
    })
  ),
})

/**
 * What a dispatcher sees when they ask what slipped.
 *
 * Tenant-scoped, like every other screen: the company comes off the caller's
 * own membership row, never off the input. Its cross-company twin is
 * `sweepOverdueJobs`, which the cron runs — same question, different audience,
 * and the difference between them is the whole tenant story.
 */
export const overdueJobs = pikkuFunc({
  expose: true,
  description: 'Scheduled jobs whose slot has passed, for the caller company.',
  output: OverdueJobsOutput,
  scopes: ['reports:read'],
  func: async ({ kysely }, _data, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)
    const now = new Date().toISOString()

    const rows = await kysely
      .selectFrom('job')
      .leftJoin('technician', 'technician.technicianId', 'job.technicianId')
      .select([
        'job.jobId',
        'job.title',
        'job.scheduledFor',
        'technician.name as technicianName',
      ])
      .where('job.companyId', '=', companyId)
      .where('job.status', 'in', ['scheduled', 'awaiting_parts'])
      .where('job.scheduledFor', '<', now)
      .orderBy('job.scheduledFor', 'asc')
      .execute()

    return {
      overdue: rows.map((row) => ({
        jobId: row.jobId,
        title: row.title,
        scheduledFor: row.scheduledFor ?? now,
        technicianName: row.technicianName,
      })),
    }
  },
})
