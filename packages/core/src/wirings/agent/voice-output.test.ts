import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  voiceOutput,
  unspeakableScripts,
  voiceForText,
} from './voice-output.js'
import type { AgentStreamEvent } from './agent.types.js'
import { SPOKEN_TURN } from './voice-input.js'

const KOKORO_SCRIPTS = ['latin', 'devanagari', 'han', 'kana']

/** The same four, as the voice each one has to be spoken in. */
const KOKORO_VOICES = {
  han: 'zf_xiaobei',
  kana: 'jf_alpha',
  devanagari: 'hf_alpha',
  latin: 'af_bella',
}

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * Drives the hook exactly as `agent-stream` does, so `out` is the order the
 * client actually sees — returned events and `emit`ed ones interleaved on the
 * one channel.
 */
const createStream = (
  mw: ReturnType<typeof voiceOutput>,
  services: unknown,
  shared: Record<string, unknown> = {}
) => {
  const state: Record<string, unknown> = {}
  const allEvents: AgentStreamEvent[] = []
  const out: AgentStreamEvent[] = []
  const next = async (event: AgentStreamEvent) => {
    out.push(event)
  }
  return {
    out,
    types: () => out.map((event) => event.type),
    spoken: () =>
      out
        .filter((event) => event.type === 'audio-delta')
        .map((event) => atob((event as { data: string }).data)),
    send: async (event: AgentStreamEvent) => {
      allEvents.push(event)
      const result = await mw.modifyOutputStream!(services as any, {
        event,
        allEvents,
        state,
        shared,
        emit: next,
      })
      if (result == null) return
      if (Array.isArray(result)) {
        for (const r of result) await next(r)
      } else {
        await next(result)
      }
    },
  }
}

/** Labels the audio with the text it came from so order is checkable. */
const speechFor = (text: string) => ({
  audio: { uint8Array: new TextEncoder().encode(text.trim()), format: 'mp3' },
})

describe('voiceOutput', () => {
  test('lets the text through while the speech is still being generated', async () => {
    // The regression this guards: awaiting synthesis inside the hook stalls
    // the reader at every full stop, and the stall is as long as the speech
    // provider takes.
    const gate = deferred()
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          await gate.promise
          return speechFor(text)
        },
      },
    }

    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)
    await stream.send({ type: 'text-delta', text: 'Hello there.' } as any)

    assert.deepEqual(stream.types(), ['text-delta'])
    gate.resolve()
  })

  test('speaks sentences in order even when the later one is ready first', async () => {
    const slow = deferred()
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          // A short sentence after a long one routinely finishes first.
          if (text.includes('first')) await slow.promise
          return speechFor(text)
        },
      },
    }

    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)
    await stream.send({ type: 'text-delta', text: 'The first one.' } as any)
    await stream.send({ type: 'text-delta', text: ' Second.' } as any)
    slow.resolve()
    await stream.send({ type: 'done' } as any)

    assert.deepEqual(stream.spoken(), ['The first one.', 'Second.'])
  })

  test('holds done until everything queued has been spoken', async () => {
    const gate = deferred()
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          await gate.promise
          return speechFor(text)
        },
      },
    }

    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)
    await stream.send({ type: 'text-delta', text: 'All done.' } as any)

    const finished = stream.send({ type: 'done' } as any)
    assert.deepEqual(stream.types(), ['text-delta'])

    gate.resolve()
    await finished

    // audio-done has to mean it, so the chunk precedes it.
    assert.deepEqual(stream.types(), [
      'text-delta',
      'audio-delta',
      'audio-done',
      'done',
    ])
  })

  test('speaks a trailing fragment the model never punctuated', async () => {
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => speechFor(text),
      },
    }

    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)
    await stream.send({ type: 'text-delta', text: 'no full stop here' } as any)
    await stream.send({ type: 'done' } as any)

    assert.deepEqual(stream.spoken(), ['no full stop here'])
  })

  test('says nothing extra when the reply ended on a boundary', async () => {
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => speechFor(text),
      },
    }

    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)
    await stream.send({ type: 'text-delta', text: 'Complete.' } as any)
    await stream.send({ type: 'done' } as any)

    assert.deepEqual(stream.spoken(), ['Complete.'])
  })

  test('carries on after a sentence fails to synthesize, and says why', async () => {
    const errors: string[] = []
    const services = {
      logger: { error: (message: string) => errors.push(message) },
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          if (text.includes('boom')) throw new Error('provider exploded')
          return speechFor(text)
        },
      },
    }

    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)
    await stream.send({ type: 'text-delta', text: 'This is boom.' } as any)
    await stream.send({ type: 'text-delta', text: ' This survives.' } as any)
    await stream.send({ type: 'done' } as any)

    // One sentence going unspoken beats the rest of the reply never arriving.
    assert.deepEqual(stream.spoken(), ['This survives.'])
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /provider exploded/)
    assert.ok(stream.types().includes('done'))
  })

  test('stays out of the way when the runner cannot speak at all', async () => {
    const stream = createStream(voiceOutput({ model: 'mock/tts' }), {
      agentRunner: {},
    })
    await stream.send({ type: 'text-delta', text: 'Hello.' } as any)
    await stream.send({ type: 'done' } as any)

    // No audio events, and crucially no `audio-done` promising audio that is
    // never coming.
    assert.deepEqual(stream.types(), ['text-delta', 'done'])
  })

  test('a script the model cannot pronounce is reported, not mangled', async () => {
    // Kokoro handed Arabic does not fail and does not stay quiet — it reads out
    // the letter names for twenty-odd seconds. Sending it nothing and saying so
    // is the only honest option.
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text)
          return speechFor(text)
        },
      },
    }
    const stream = createStream(
      voiceOutput({ model: 'mock/tts', speakableScripts: KOKORO_SCRIPTS }),
      services
    )

    await stream.send({ type: 'text-delta', text: 'مرحبا بك.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, [], 'nothing should have been sent for synthesis')
    const notice = stream.out.find((event) => event.type === 'data') as
      { name: string; data: { scripts: string[] } } | undefined
    assert.equal(notice?.name, 'voice-unsupported')
    assert.deepEqual(notice?.data.scripts, ['arabic'])
  })

  test('a reply says it once, however many sentences it is', async () => {
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => speechFor(text),
      },
    }
    const stream = createStream(
      voiceOutput({ model: 'mock/tts', speakableScripts: KOKORO_SCRIPTS }),
      services
    )

    await stream.send({ type: 'text-delta', text: 'مرحبا.' })
    await stream.send({ type: 'text-delta', text: 'كيف حالك؟' })
    await stream.send({ type: 'done' })

    assert.equal(
      stream.out.filter((event) => event.type === 'data').length,
      1,
      'the notice belongs to the reply, not to each sentence'
    )
  })

  test('a bilingual reply still speaks the half it can', async () => {
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text.trim())
          return speechFor(text)
        },
      },
    }
    const stream = createStream(
      voiceOutput({ model: 'mock/tts', speakableScripts: KOKORO_SCRIPTS }),
      services
    )

    await stream.send({ type: 'text-delta', text: 'Added it.' })
    await stream.send({ type: 'text-delta', text: ' تمت الإضافة.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, ['Added it.'])
  })

  test('each sentence is spoken in the voice its own script needs', async () => {
    // The bug this guards is silent and expensive to find by ear: Kokoro handed
    // Chinese in its default English voice does not fail, it spells the
    // characters out for three times the duration.
    const asked: Array<{ text: string; voice?: string }> = []
    const services = {
      agentRunner: {
        generateSpeech: async ({
          text,
          voice,
        }: {
          text: string
          voice?: string
        }) => {
          asked.push({ text: text.trim(), voice })
          return speechFor(text)
        },
      },
    }
    const stream = createStream(
      voiceOutput({ model: 'mock/tts', speakableScripts: KOKORO_VOICES }),
      services
    )

    await stream.send({ type: 'text-delta', text: 'Added it.' })
    await stream.send({ type: 'text-delta', text: ' 已添加。' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, [
      { text: 'Added it.', voice: 'af_bella' },
      { text: '已添加。', voice: 'zf_xiaobei' },
    ])
  })

  test('a typed turn is answered in text only', async () => {
    // The cost case. One agent serves both kinds of caller, so a reply to
    // something typed must not quietly synthesize speech nobody asked to hear
    // — it is billed per sentence, on every turn.
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text)
          return speechFor(text)
        },
      },
    }
    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services, {
      [SPOKEN_TURN]: false,
    })

    await stream.send({ type: 'text-delta', text: 'Added it.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, [])
    assert.deepEqual(stream.types(), ['text-delta', 'done'])
  })

  test('a spoken turn is answered aloud', async () => {
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text)
          return speechFor(text)
        },
      },
    }
    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services, {
      [SPOKEN_TURN]: true,
    })

    await stream.send({ type: 'text-delta', text: 'Added it.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, ['Added it.'])
  })

  test('`always` speaks a typed turn too', async () => {
    // Read-aloud modes exist, and for them speech is not a reply to speech.
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text)
          return speechFor(text)
        },
      },
    }
    const stream = createStream(
      voiceOutput({ model: 'mock/tts', always: true }),
      services,
      { [SPOKEN_TURN]: false }
    )

    await stream.send({ type: 'text-delta', text: 'Added it.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, ['Added it.'])
  })

  test('speaks when nothing reported how the turn arrived', async () => {
    // voiceOutput without voiceInput: nobody set the note, so there is no
    // evidence the turn was typed and the pre-existing behaviour stands.
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text)
          return speechFor(text)
        },
      },
    }
    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)

    await stream.send({ type: 'text-delta', text: 'Added it.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, ['Added it.'])
  })

  test('a script with no voice mapped is still refused, not mis-voiced', async () => {
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text)
          return speechFor(text)
        },
      },
    }
    const stream = createStream(
      voiceOutput({ model: 'mock/tts', speakableScripts: KOKORO_VOICES }),
      services
    )

    await stream.send({ type: 'text-delta', text: 'مرحبا بك.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, [])
    const notice = stream.out.find((event) => event.type === 'data') as
      { name: string; data: { scripts: string[] } } | undefined
    assert.deepEqual(notice?.data.scripts, ['arabic'])
  })

  test('no declared scripts means every model is trusted with everything', async () => {
    const asked: string[] = []
    const services = {
      agentRunner: {
        generateSpeech: async ({ text }: { text: string }) => {
          asked.push(text.trim())
          return speechFor(text)
        },
      },
    }
    const stream = createStream(voiceOutput({ model: 'mock/tts' }), services)

    await stream.send({ type: 'text-delta', text: 'مرحبا بك.' })
    await stream.send({ type: 'done' })

    assert.deepEqual(asked, ['مرحبا بك.'])
  })
})

describe('unspeakableScripts', () => {
  test('names the scripts present that the model was not given', () => {
    assert.deepEqual(unspeakableScripts('مرحبا', KOKORO_SCRIPTS), ['arabic'])
    assert.deepEqual(unspeakableScripts('Привет', KOKORO_SCRIPTS), ['cyrillic'])
    assert.deepEqual(unspeakableScripts('안녕하세요', KOKORO_SCRIPTS), [
      'hangul',
    ])
  })

  test('the seven Kokoro handles are all one Latin test, plus three', () => {
    // Spanish, French, Italian and Brazilian Portuguese are not separable from
    // English by script, and do not need to be — the model speaks all of them.
    for (const text of [
      'Hello.',
      'Añadido.',
      'Ajouté.',
      'Aggiunto.',
      'Adicionado.',
    ]) {
      assert.deepEqual(unspeakableScripts(text, KOKORO_SCRIPTS), [], text)
    }
    assert.deepEqual(unspeakableScripts('जोड़ा गया', KOKORO_SCRIPTS), [])
    assert.deepEqual(unspeakableScripts('已添加', KOKORO_SCRIPTS), [])
    assert.deepEqual(unspeakableScripts('追加しました', KOKORO_SCRIPTS), [])
  })

  test('punctuation and digits are not a script anyone has to support', () => {
    assert.deepEqual(
      unspeakableScripts('42 — "ok"? (yes!)', KOKORO_SCRIPTS),
      []
    )
  })

  test('the voice map declares the same scripts the array form does', () => {
    assert.deepEqual(unspeakableScripts('مرحبا', KOKORO_VOICES), ['arabic'])
    assert.deepEqual(unspeakableScripts('已添加', KOKORO_VOICES), [])
  })
})

describe('voiceForText', () => {
  test('picks the voice belonging to the script in front of it', () => {
    assert.equal(voiceForText('已添加', KOKORO_VOICES), 'zf_xiaobei')
    assert.equal(voiceForText('追加しました', KOKORO_VOICES), 'jf_alpha')
    assert.equal(voiceForText('जोड़ा गया', KOKORO_VOICES), 'hf_alpha')
    assert.equal(voiceForText('Added it.', KOKORO_VOICES), 'af_bella')
  })

  test('a mixed sentence takes the voice of the script that needs one', () => {
    // A Chinese voice reading an English word is accented; an English voice
    // reading Chinese spells it out. Only one of those is recoverable.
    assert.equal(
      voiceForText('The title is 清单.', KOKORO_VOICES),
      'zf_xiaobei'
    )
  })

  test('falls back when nothing mapped appears, and when nothing is mapped', () => {
    assert.equal(voiceForText('42!', KOKORO_VOICES, 'af_heart'), 'af_heart')
    // The array form declares no voices at all, so the configured one stands.
    assert.equal(voiceForText('已添加', KOKORO_SCRIPTS, 'af_heart'), 'af_heart')
  })
})
