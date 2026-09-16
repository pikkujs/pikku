import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { WrongCompanyError } from '../../errors.js'

export const AddVoiceNoteInput = z.object({
  jobId: z.string(),
  technicianId: z.string(),
  /**
   * The transcript, not the audio.
   *
   * Transcription happens before this call, so the recording never becomes
   * something this app has to keep, redact or delete on request.
   */
  transcript: z.string().min(1).max(8000),
})

export const AddVoiceNoteOutput = z.object({ voiceNoteId: z.string() })

export const addVoiceNote = pikkuFunc({
  expose: true,
  description: 'Attach a dictated note to a job.',
  input: AddVoiceNoteInput,
  output: AddVoiceNoteOutput,
  scopes: ['visits:log'],
  func: async (
    { kysely },
    { jobId, technicianId, transcript },
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

    const voiceNoteId = randomUUID()
    await kysely
      .insertInto('voiceNote')
      .values({
        voiceNoteId,
        companyId,
        jobId,
        technicianId,
        transcript,
        createdAt: new Date().toISOString(),
      })
      .execute()

    return { voiceNoteId }
  },
})
