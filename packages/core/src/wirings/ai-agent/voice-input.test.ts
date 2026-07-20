import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { voiceInput } from './voice-input.js'
import type { AIContentPart, AIMessage } from './ai-agent.types.js'

/**
 * A runner whose `transcribe` reads instance state through `this`, mirroring the
 * real `VercelAIAgentRunner` where `transcribe` calls `this.getModel(...)`. If
 * the middleware grabs the method as a bare reference the receiver is lost and
 * `this` is undefined — which is exactly the regression this guards.
 */
class ThisDependentRunner {
  private readonly transcript = 'the transcribed spoken words'

  async transcribe() {
    return {
      text: this.transcript,
      segments: [],
      language: 'en',
      durationInSeconds: 1,
      warnings: [],
    }
  }
}

const audioMessage = (): AIMessage => ({
  id: 'm1',
  role: 'user',
  content: [
    { type: 'file', mediaType: 'audio/wav', data: 'AAAA' },
  ] as AIContentPart[],
  createdAt: new Date(0),
})

describe('voiceInput', () => {
  test('transcribes an audio part by calling the runner with its receiver intact', async () => {
    const mw = voiceInput({ model: 'mock/whisper' })
    const services = { aiAgentRunner: new ThisDependentRunner() }

    const result = await mw.modifyInput!(services as any, {
      messages: [audioMessage()],
      instructions: 'sys',
    })

    const last = result.messages[result.messages.length - 1]!
    const parts = last.content as AIContentPart[]
    assert.equal(parts.length, 1)
    assert.equal(parts[0]!.type, 'text')
    assert.equal(
      (parts[0] as { text: string }).text,
      'the transcribed spoken words'
    )
    assert.ok(!parts.some((p) => p.type === 'file'))
  })

  test('leaves the message untouched when there is no audio part', async () => {
    const mw = voiceInput({ model: 'mock/whisper' })
    const services = { aiAgentRunner: new ThisDependentRunner() }
    const messages: AIMessage[] = [
      {
        id: 'm1',
        role: 'user',
        content: 'just text',
        createdAt: new Date(0),
      },
    ]

    const result = await mw.modifyInput!(services as any, {
      messages,
      instructions: 'sys',
    })

    assert.equal(result.messages[0]!.content, 'just text')
  })

  test('throws when an audio part is present but no model is configured', async () => {
    const mw = voiceInput({})
    const services = { aiAgentRunner: new ThisDependentRunner() }

    await assert.rejects(
      () =>
        mw.modifyInput!(services as any, {
          messages: [audioMessage()],
          instructions: 'sys',
        }),
      /voiceInput requires a transcription model/
    )
  })
})
