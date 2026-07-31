import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  voiceInput,
  readsAsNonSpeech,
  NoSpeechDetectedError,
} from './voice-input.js'
import type { AIContentPart, AIMessage } from './ai-agent.types.js'

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

  test('a turn with no speech in it never reaches the model', async () => {
    // The failure this prevents: the user says nothing, the model answers
    // anyway, and what it answers is a guess about audio it could not hear.
    // An ASR that returns '' on non-speech is what makes this checkable — see
    // readsAsNonSpeech for why nothing subtler than '' survived contact.
    const silent = {
      async transcribe() {
        return { text: '', segments: [], warnings: [] }
      },
    }
    const mw = voiceInput({
      model: 'deepinfra/nvidia/Nemotron-3.5-ASR-Streaming-Multilingual-0.6b',
    })

    await assert.rejects(
      () =>
        mw.modifyInput!({ aiAgentRunner: silent } as any, {
          messages: [audioMessage()],
          instructions: 'sys',
        }),
      NoSpeechDetectedError
    )
  })

  test('a transcript is passed through exactly as the provider wrote it', async () => {
    // No reassembly, no trimming, no filtering — whatever the model heard is
    // what the agent is asked about.
    const spaced = {
      async transcribe() {
        return {
          text: '  spacing   the provider chose  ',
          segments: [],
          warnings: [],
        }
      },
    }
    const mw = voiceInput({ model: 'mock/asr' })

    const result = await mw.modifyInput!({ aiAgentRunner: spaced } as any, {
      messages: [audioMessage()],
      instructions: 'sys',
    })

    const parts = result.messages.at(-1)!.content as AIContentPart[]
    assert.equal(
      (parts[0] as { text: string }).text,
      '  spacing   the provider chose  '
    )
  })
})

describe('readsAsNonSpeech', () => {
  test('only an empty transcript counts as nothing said', () => {
    assert.equal(readsAsNonSpeech({ text: '' }), true)
    assert.equal(readsAsNonSpeech({ text: '   ' }), true)
    assert.equal(readsAsNonSpeech({}), true)
    assert.equal(readsAsNonSpeech({ text: 'add milk to the list' }), false)
  })

  test('a short or low-confidence-looking transcript is still speech', () => {
    // The gate that used to live here would have been tempted by these. "Yes"
    // is the single most important word in an approval flow, and dropping it
    // because it is brief or quiet is far worse than keeping a stray one.
    assert.equal(readsAsNonSpeech({ text: 'yes' }), false)
    assert.equal(readsAsNonSpeech({ text: 'Thank you.' }), false)
  })
})
