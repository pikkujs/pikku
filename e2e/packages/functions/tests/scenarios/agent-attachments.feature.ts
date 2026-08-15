/**
 * A request can carry image or file attachments alongside its text. They are
 * turned into content parts on the user message and handed to the model, which
 * is visible in the scripted model's request log.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const AGENT = 'todoReadAgent'
const RESOURCE_ID = 'agent-attachments'
const ALICE = { userId: 'alice' }

/** A 1x1 PNG, base64. The bytes are never decoded — only the part shape is. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'

export const agentAttachmentsImageReachesModelScenario = pikkuScenario<
  void,
  { mediaType: string }
>({
  title: 'An image attachment reaches the model as a non-text part',
  description: 'The image becomes a content part on the user message',
  tags: ['scenario', 'agent-protocol', 'agent-attachments'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs with an image', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'look at this image',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
      attachments: [{ type: 'image', data: PIXEL, mediaType: 'image/png' }],
    })
    await scenario.then('sees the image part', 'expectsModelCall', {
      calls: run.ownCalls,
      index: 1,
      hasNonTextPart: true,
      attachmentMediaType: 'image/png',
    })
    return { mediaType: 'image/png' }
  },
})

export const agentAttachmentsFilePreservesMediaTypeScenario = pikkuScenario<
  void,
  { mediaType: string }
>({
  title: 'A file attachment preserves its media type',
  description: 'The declared media type is what the model is handed',
  tags: ['scenario', 'agent-protocol', 'agent-attachments'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs with a file', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'read this file',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
      attachments: [
        {
          type: 'file',
          data: PIXEL,
          mediaType: 'application/pdf',
          filename: 'report.pdf',
        },
      ],
    })
    await scenario.then('sees the file part', 'expectsModelCall', {
      calls: run.ownCalls,
      index: 1,
      hasNonTextPart: true,
      attachmentMediaType: 'application/pdf',
    })
    return { mediaType: 'application/pdf' }
  },
})

export const agentAttachmentsFeature = pikkuFeature({
  name: 'Attachments reach the model as content parts',
  description:
    'Images and files become content parts on the user message, keeping their media type',
  tags: ['agent-protocol', 'agent-attachments'],
  scenarios: [
    agentAttachmentsImageReachesModelScenario,
    agentAttachmentsFilePreservesMediaTypeScenario,
  ],
})
