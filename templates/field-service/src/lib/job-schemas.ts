import { z } from 'zod'

/**
 * The status and priority sets, spelled once.
 *
 * They mirror the CHECK constraints in `db/sqlite/0003-field-service.sql`.
 * Widening the constraint without widening these is the drift worth catching:
 * the database would accept a row the generated client says cannot exist.
 */
export const JobStatus = z.enum([
  'new',
  'scheduled',
  'in_progress',
  'awaiting_parts',
  'done',
  'cancelled',
])

export const JobPriority = z.enum(['low', 'normal', 'urgent'])

export const JobSummary = z.object({
  jobId: z.string(),
  title: z.string(),
  status: JobStatus,
  priority: JobPriority,
  scheduledFor: z.string().nullable(),
  customerName: z.string(),
  technicianName: z.string().nullable(),
})
