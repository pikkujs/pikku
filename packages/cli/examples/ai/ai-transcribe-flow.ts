//~ name: ai-transcribe-flow
//~ title: Upload → transcribe → stored transcript, as a durable workflow (the whole STT journey)
//~ when: The app STORES recordings and their transcripts — a user uploads audio and later reads the transcript back (sessions, voice notes, call logs, interviews). This is the complete journey: the create RPC saves the row as 'processing' and starts the workflow; the step transcribes server-side and flips the row to 'ready'. Pair it with the file-upload scaffold (the client uploads first, then calls createRecording with the fileKey). Pick the plain {name: ai-transcribe} instead when the transcript is ephemeral — transcribed, shown, never persisted. Adapt the `recording` table/name to the app's domain entity; keep the shape.
//~ deferUntil: entity-write
//~ entity: recording
//~ lang: ts
//~ The SPLIT is load-bearing (same rules as {name: workflow}): the workflow lives in
//~ src/workflows/*.workflow.ts, each step func in its own file, and the migration ships
//~ the table the flow writes to. The client NEVER supplies transcript text — the server
//~ computes it. A milestone that promises transcription is only met by this shape (the
//~ build-complete gate checks for the agentRunner call).

//~ steps:
//~ ═══ CLIENT SIDE — upload, create, poll ═══
//~ 1. Upload via the file-upload scaffold (requestFileUpload → PUT bytes → fileKey).
//~ 2. const create = usePikkuMutation('createRecording')
//~    create.mutate({ fileKey, fileName })  // row appears instantly as 'processing'
//~ 3. Poll the list while anything is processing — usePikkuQuery('listRecordings', {},
//~    { refetchInterval: (q) => q.state.data?.recordings.some((r) => r.status === 'processing') ? 2000 : false })
//~    Render status inline (Badge: processing=blue, ready=green, failed=red) and the
//~    transcript on the detail view once ready. Errors inline via create.error — never a toast.
// ===== FILE: db/sqlite/0003-recording.sql =====
//~ Renumber to the next free slot in db/sqlite/ (or db/postgres/ with that engine's
//~ types) — migrations apply in filename order. After adding it: `pikku db migrate`
//~ regenerates the kysely/zod types this code compiles against.
-- One uploaded recording and its server-computed transcript. `status` is the
-- lifecycle the UI polls: processing → ready | failed.
CREATE TABLE recording (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  transcript TEXT,
  duration_seconds INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

// ===== FILE: packages/functions/src/functions/create-recording.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

//~ Called AFTER the file-upload scaffold's requestFileUpload + client PUT. Saves the
//~ row in 'processing' and starts the durable workflow — the caller gets the row back
//~ immediately and the UI polls status. No transcript field in the input, ever.
export const CreateRecordingInput = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().optional(),
})
export const CreateRecordingOutput = z.object({
  recording: z.object({
    id: z.string(),
    status: z.string(),
    fileName: z.string().nullable(),
    createdAt: z.string(),
  }),
})

export const createRecording = pikkuFunc({
  expose: true,
  auth: true,
  description: 'Save an uploaded recording and start its transcription workflow.',
  input: CreateRecordingInput,
  output: CreateRecordingOutput,
  func: async ({ kysely }, input, { session, rpc }) => {
    const row = await kysely
      .insertInto('recording')
      .values({
        id: crypto.randomUUID(),
        userId: session!.userId,
        fileKey: input.fileKey,
        fileName: input.fileName ?? null,
        status: 'processing',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await rpc.startWorkflow('transcribeRecordingWorkflow', { recordingId: row.id })
    return {
      recording: {
        id: row.id,
        status: row.status,
        fileName: row.fileName,
        createdAt: String(row.createdAt),
      },
    }
  },
})

// ===== FILE: packages/functions/src/functions/transcribe-recording-step.function.ts =====
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { BUCKET } from '../lib/file-keys.js'

//~ Provider-prefixed ASR model the proxy routes — pinned, never freehand a model id
//~ (`whisper-1` etc. is NOT routed and 401s at runtime). Why whisper over nemotron-asr:
//~ see the note in {name: ai-transcribe}.
const STT_MODEL = 'openai/whisper-large-v3-turbo'

export const TranscribeRecordingStepInput = z.object({ recordingId: z.string().min(1) })
export const TranscribeRecordingStepOutput = z.object({ status: z.string() })

export const transcribeRecordingStep = pikkuSessionlessFunc({
  expose: true, //~ steps must be registered RPCs so workflow.do can dispatch them
  description: 'Transcribe a stored recording and save the transcript on its row.',
  input: TranscribeRecordingStepInput,
  output: TranscribeRecordingStepOutput,
  func: async ({ kysely, content, agentRunner }, input) => {
    if (!agentRunner?.transcribe) {
      throw new Error('agentRunner not configured — AI is unavailable in this stage')
    }
    const row = await kysely
      .selectFrom('recording')
      .selectAll()
      .where('id', '=', input.recordingId)
      .executeTakeFirstOrThrow()

    //~ The STT API wants raw bytes, so sign a short-lived URL for our own stored file
    //~ and fetch it — the same signContentKey the file-upload scaffold's view RPC uses.
    const url = await content.signContentKey({
      bucket: BUCKET,
      contentKey: row.fileKey,
      dateLessThan: new Date(Date.now() + 3_600_000),
    })
    const res = await fetch(url)
    if (!res.ok) {
      //~ A missing/unreadable file is permanent for this row — mark it failed so the
      //~ UI stops polling, THEN throw so the workflow records the failure.
      await kysely
        .updateTable('recording')
        .set({ status: 'failed', error: `could not fetch audio (${res.status})` })
        .where('id', '=', input.recordingId)
        .execute()
      throw new Error(`could not fetch audio (${res.status})`)
    }
    const audio = new Uint8Array(await res.arrayBuffer())

    const result = await agentRunner.transcribe({ model: STT_MODEL, audio })
    await kysely
      .updateTable('recording')
      .set({
        status: 'ready',
        transcript: result.text,
        durationSeconds: result.durationInSeconds ?? null,
      })
      .where('id', '=', input.recordingId)
      .execute()
    return { status: 'ready' }
  },
})

// ===== FILE: packages/functions/src/workflows/transcribe-recording.workflow.ts =====
import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow'

//~ One durable step is the point: the container can restart mid-transcription and the
//~ run resumes instead of leaving the row 'processing' forever. Chain follow-on AI here
//~ as MORE steps — e.g. after transcribing, extract themes/tags from the transcript with
//~ an {name: ai-extract} step func:
//~   await workflow.do('Extract themes', 'extractRecordingThemes', { recordingId: data.recordingId })
export const TranscribeRecordingWorkflowInput = z.object({ recordingId: z.string().min(1) })
export const TranscribeRecordingWorkflowOutput = z.object({ status: z.string() })

export const transcribeRecordingWorkflow = pikkuWorkflowFunc({
  description: 'Transcribe an uploaded recording and store the transcript on its row.',
  input: TranscribeRecordingWorkflowInput,
  output: TranscribeRecordingWorkflowOutput,
  func: async (_services, data, { workflow }) => {
    const result = await workflow.do('Transcribe recording', 'transcribeRecordingStep', {
      recordingId: data.recordingId,
    })
    return { status: result.status }
  },
})
