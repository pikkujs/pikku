import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { WrongCompanyError } from '../../errors.js'
import { JobStatus } from '../../lib/job-schemas.js'
import { canDispatch, isAssignedTechnician } from '../../security.js'

export const SetJobStatusInput = z.object({
  jobId: z.string(),
  status: JobStatus,
})

export const SetJobStatusOutput = z.object({
  jobId: z.string(),
  status: JobStatus,
})

export const setJobStatus = pikkuFunc({
  expose: true,
  description: 'Move a job along its status ladder.',
  input: SetJobStatusInput,
  output: SetJobStatusOutput,
  // Scope AND permission. The scope says who may move work along at all; the
  // permission says whose work. Two keys because two kinds of caller belong
  // here — the technician the job was sent to, and the dispatcher who owns the
  // board — and neither needs a branch in the body.
  scopes: ['jobs:progress'],
  permissions: { assigned: isAssignedTechnician, dispatcher: canDispatch },
  node: { displayName: 'Set Job Status', category: 'Jobs', type: 'action' },
  func: async ({ kysely, auditLog }, { jobId, status }, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)
    const now = new Date().toISOString()

    const updated = await kysely
      .updateTable('job')
      .set({ status, updatedAt: now })
      .where('jobId', '=', jobId)
      .where('companyId', '=', companyId)
      .executeTakeFirst()

    if (Number(updated.numUpdatedRows) === 0) throw new WrongCompanyError()

    await auditLog.write({
      type: 'job.status_changed',
      source: 'explicit',
      metadata: { jobId, status },
    })

    return { jobId, status }
  },
})
