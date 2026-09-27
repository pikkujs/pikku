import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { WrongCompanyError } from '../../errors.js'

export const AssignJobInput = z.object({
  jobId: z.string(),
  technicianId: z.string(),
  scheduledFor: z.string().optional(),
})

export const AssignJobOutput = z.object({
  jobId: z.string(),
  technicianId: z.string(),
  status: z.string(),
})

export const assignJob = pikkuFunc({
  expose: true,
  description: 'Put a job on a technician and schedule it.',
  input: AssignJobInput,
  output: AssignJobOutput,
  // A technician holds `jobs:progress` but not `jobs:assign`, so this is the
  // line between working a job and handing one out.
  scopes: ['jobs:assign'],
  // Sending somebody to an address is a real-world consequence, so when the
  // dispatch assistant reaches for this tool the run pauses and a human
  // confirms. The flag changes nothing for the HTTP route below it: a
  // dispatcher clicking "assign" has already made the decision.
  approvalRequired: true,
  approvalDescription: async (
    { kysely },
    input: { jobId: string; technicianId: string }
  ) => {
    const [job, technician] = await Promise.all([
      kysely
        .selectFrom('job')
        .select('title')
        .where('jobId', '=', input.jobId)
        .executeTakeFirst(),
      kysely
        .selectFrom('technician')
        .select('name')
        .where('technicianId', '=', input.technicianId)
        .executeTakeFirst(),
    ])
    return `Send ${technician?.name ?? 'that technician'} to "${job?.title ?? input.jobId}"?`
  },
  node: { displayName: 'Assign Job', category: 'Jobs', type: 'action' },
  func: async (
    { kysely, auditLog },
    { jobId, technicianId, scheduledFor },
    { session }
  ) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    const [job, technician] = await Promise.all([
      kysely
        .selectFrom('job')
        .select('jobId')
        .where('jobId', '=', jobId)
        .where('companyId', '=', companyId)
        .executeTakeFirst(),
      kysely
        .selectFrom('technician')
        .select(['technicianId', 'isActive'])
        .where('technicianId', '=', technicianId)
        .where('companyId', '=', companyId)
        .executeTakeFirst(),
    ])

    if (!job || !technician) throw new WrongCompanyError()
    if (technician.isActive !== 1) {
      throw new Error('That technician is no longer active')
    }

    const now = new Date().toISOString()
    await kysely
      .updateTable('job')
      .set({
        technicianId,
        status: 'scheduled',
        scheduledFor: scheduledFor ?? now,
        updatedAt: now,
      })
      .where('jobId', '=', jobId)
      .execute()

    await auditLog.write({
      type: 'job.assigned',
      source: 'explicit',
      metadata: { jobId, technicianId },
    })

    return { jobId, technicianId, status: 'scheduled' }
  },
})
