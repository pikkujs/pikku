import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { WrongCompanyError } from '../../errors.js'
import { JobPriority, JobStatus } from '../../lib/job-schemas.js'

export const GetJobInput = z.object({ jobId: z.string() })

export const GetJobOutput = z.object({
  jobId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: JobStatus,
  priority: JobPriority,
  scheduledFor: z.string().nullable(),
  customer: z.object({
    customerId: z.string(),
    name: z.string(),
    address: z.string(),
  }),
  technicianId: z.string().nullable(),
  visits: z.array(
    z.object({
      visitId: z.string(),
      technicianName: z.string(),
      startedAt: z.string().nullable(),
      endedAt: z.string().nullable(),
      notes: z.string().nullable(),
    })
  ),
  notes: z.array(
    z.object({
      voiceNoteId: z.string(),
      transcript: z.string(),
      createdAt: z.string(),
    })
  ),
})

export const getJob = pikkuFunc({
  expose: true,
  description: 'Read one job with its visit history and voice notes.',
  input: GetJobInput,
  output: GetJobOutput,
  scopes: ['jobs:read'],
  func: async ({ kysely }, { jobId }, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    const job = await kysely
      .selectFrom('job')
      .innerJoin('customer', 'customer.customerId', 'job.customerId')
      .select([
        'job.jobId',
        'job.title',
        'job.description',
        'job.status',
        'job.priority',
        'job.scheduledFor',
        'job.technicianId',
        'customer.customerId',
        'customer.name as customerName',
        'customer.address as customerAddress',
      ])
      .where('job.jobId', '=', jobId)
      .where('job.companyId', '=', companyId)
      .executeTakeFirst()

    // Not found and not yours are the same answer on purpose.
    if (!job) throw new WrongCompanyError()

    const [visits, notes] = await Promise.all([
      kysely
        .selectFrom('visit')
        .innerJoin(
          'technician',
          'technician.technicianId',
          'visit.technicianId'
        )
        .select([
          'visit.visitId',
          'visit.startedAt',
          'visit.endedAt',
          'visit.notes',
          'technician.name as technicianName',
        ])
        .where('visit.jobId', '=', jobId)
        .orderBy('visit.createdAt', 'asc')
        .execute(),
      kysely
        .selectFrom('voiceNote')
        .select(['voiceNoteId', 'transcript', 'createdAt'])
        .where('jobId', '=', jobId)
        .orderBy('createdAt', 'asc')
        .execute(),
    ])

    return {
      jobId: job.jobId,
      title: job.title,
      description: job.description,
      status: job.status,
      priority: job.priority,
      scheduledFor: job.scheduledFor,
      customer: {
        customerId: job.customerId,
        name: job.customerName,
        address: job.customerAddress,
      },
      technicianId: job.technicianId,
      visits,
      notes,
    }
  },
})
