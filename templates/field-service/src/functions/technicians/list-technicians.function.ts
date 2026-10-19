import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'

export const ListTechniciansOutput = z.object({
  technicians: z.array(
    z.object({
      technicianId: z.string(),
      name: z.string(),
      skills: z.array(z.string()),
      openJobs: z.number(),
    })
  ),
})

export const listTechnicians = pikkuFunc({
  expose: true,
  description: 'List active technicians with how much work each is carrying.',
  output: ListTechniciansOutput,
  scopes: ['jobs:read'],
  func: async ({ kysely }, _data, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    const rows = await kysely
      .selectFrom('technician')
      .leftJoin('job', (join) =>
        join
          .onRef('job.technicianId', '=', 'technician.technicianId')
          .on('job.status', 'in', [
            'scheduled',
            'in_progress',
            'awaiting_parts',
          ])
      )
      .select([
        'technician.technicianId',
        'technician.name',
        'technician.skills',
        (eb) => eb.fn.count<number>('job.jobId').as('openJobs'),
      ])
      .where('technician.companyId', '=', companyId)
      .where('technician.isActive', '=', 1)
      .groupBy([
        'technician.technicianId',
        'technician.name',
        'technician.skills',
      ])
      .orderBy('technician.name', 'asc')
      .execute()

    return {
      technicians: rows.map((r) => ({
        technicianId: r.technicianId,
        name: r.name,
        // `skills` is a TEXT column holding JSON. Annotating it as
        // `{ kind: 'json' }` in db/annotations.ts would have the generated type
        // parse it; parsing here keeps the example readable with one fewer
        // moving part, at the cost of this line.
        skills: JSON.parse(r.skills) as string[],
        openJobs: Number(r.openJobs),
      })),
    }
  },
})
