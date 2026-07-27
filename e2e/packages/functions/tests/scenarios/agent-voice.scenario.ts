/**
 * An audio attachment on the user message is transcribed by the voiceInput
 * middleware and replaced, in place, with its text before the model is called.
 * The scripted transcription model returns a fixed transcript, so a scenario can
 * assert the spoken words reached the model without controlling the audio bytes.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const RESOURCE_ID = 'agent-voice'

/** A 1x1 PNG, base64, declared as audio — the bytes are never decoded. */
const AUDIO =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'

/**
 * The absence assertion is scoped to this run's calls, where the cucumber step
 * searched the whole process-global log. Strictly narrower, and the property is
 * the same: the middleware replaced the audio part rather than adding to it.
 */
export const agentVoiceTranscriptReachesModelScenario = pikkuScenario<
  void,
  { transcribed: true }
>({
  title: 'An audio attachment is transcribed and the text reaches the model',
  description: 'The audio part is replaced in place, not passed through',
  tags: ['scenario', 'agent-protocol', 'agent-voice'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs with audio', 'runsAgent', {
      agent: 'voiceInputAgent',
      script: 'text-only',
      message: 'listen',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: { userId: 'alice' },
      attachments: [{ type: 'file', data: AUDIO, mediaType: 'audio/wav' }],
    })
    await scenario.then(
      'sees the transcript and no audio part',
      'expectsCallLog',
      {
        calls: run.modelCalls,
        includes: 'the transcribed spoken words',
        excludes: 'audio/',
      }
    )
    return { transcribed: true }
  },
})

export const agentVoiceWithoutTranscriptionModelFailsScenario = pikkuScenario<
  void,
  { failed: true }
>({
  title: 'Voice input without a transcription model fails the run',
  description: 'The middleware refuses rather than dropping the audio silently',
  tags: ['scenario', 'agent-protocol', 'agent-voice'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs with audio', 'runsAgent', {
      agent: 'voiceInputNoModelAgent',
      script: 'text-only',
      message: 'listen',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: { userId: 'alice' },
      attachments: [{ type: 'file', data: AUDIO, mediaType: 'audio/wav' }],
    })
    await scenario.then('sees the run fail', 'expectsRunOutcome', {
      run,
      refused: true,
    })
    return { failed: true }
  },
})

export const agentVoiceFeature = pikkuFeature({
  name: 'Voice input is transcribed before reaching the model',
  description:
    'The voiceInput middleware replaces an audio attachment with its transcript',
  tags: ['agent-protocol', 'agent-voice'],
  scenarios: [
    agentVoiceTranscriptReachesModelScenario,
    agentVoiceWithoutTranscriptionModelFailsScenario,
  ],
})
