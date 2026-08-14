/**
 * A page you can actually hold the conversation on.
 *
 * The loop only really exists once there is a microphone at one end of it.
 * Silence detection, barge-in, and the ordering between "stop talking" and
 * "stop generating" are timing behaviour that unit tests can state but not
 * exercise — this serves the smallest surface that closes it.
 *
 * The page loads `@pikku/voice-agents` straight from the package's ESM build
 * rather than reimplementing the loop inline, so what it demonstrates is the
 * shipped package and not a parallel copy of it. The React hook is deliberately
 * out of reach — it is the one module with an import a browser cannot resolve
 * unbundled — so the page drives the framework-free primitives itself, which is
 * also the honest way to show they are usable without React.
 *
 * Needs two real keys, because the voice and the words come from different
 * vendors: `DEEPINFRA_API_KEY` for transcription and speech, `OPENAI_API_KEY`
 * for the agent's own model. Run it with `PIKKU_MOCK_LLM` unset or `0` — the
 * scripted provider the deterministic suite uses answers instantly and in
 * fixed text, which is exactly wrong for judging a conversation.
 *
 * Every turn is currently transcribed twice — once by the model that drives the
 * conversation and once by Whisper — and both transcripts are shown under a
 * playable copy of the clip. That is temporary, and it is here because two
 * earlier attempts to fix Whisper's invented filler were reasoned from
 * synthetic audio and both were wrong. Synthetic noise is stationary; the
 * things that actually provoke Whisper are breath, lip-smack and keyboards. So
 * the comparison runs on real recordings instead of on an argument.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import { unspeakableScripts, voiceForText } from '@pikku/core/agent'

/**
 * The published build directory of an installed package.
 *
 * `import.meta.resolve` rather than `createRequire`, because `@pikku/voice-agents`
 * offers `import` and `require` conditions and only the former points at the
 * ESM build the browser can use.
 */
const distOf = (specifier: string) =>
  dirname(fileURLToPath(import.meta.resolve(specifier)))

/**
 * Files the page may load, and which package each comes from.
 *
 * An allow-list rather than path sanitising: this route reads from disk under a
 * name that arrives in a URL, and the set of files a demo needs is small,
 * known, and never user-supplied.
 *
 * The first group is the voice package itself, imported as modules —
 * `voice-session.js` pulls in the two detectors by relative import, so they
 * have to be here too. The rest exist only for the Silero turn detector, which
 * is opt-in on the page and served locally rather than from the library's CDN
 * so it can be tried offline and so the ~2MB model download is visible in the
 * network tab where it belongs.
 *
 * `@ricky0123/vad-web`'s browser bundle is UMD expecting a global `ort`, which
 * is why onnxruntime's classic-script build is here rather than its ESM one.
 * Its `.mjs`/`.wasm` pairs are fetched by onnxruntime itself at runtime, not by
 * the page — which variant depends on what the browser supports, so all of
 * them are listed.
 */
const SERVABLE = new Map<string, string>([
  ...(
    [
      'voice-session.js',
      'silence-detector.js',
      'speech-detector.js',
      'audio-playback-queue.js',
      'spoken-approval.js',
    ] as const
  ).map((file) => [file, '@pikku/voice-agents'] as [string, string]),
  ...(
    [
      'bundle.min.js',
      'vad.worklet.bundle.min.js',
      'silero_vad_v5.onnx',
    ] as const
  ).map((file) => [file, '@ricky0123/vad-web'] as [string, string]),
  ...(
    [
      'ort.wasm.min.js',
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.jsep.mjs',
      'ort-wasm-simd-threaded.jsep.wasm',
    ] as const
  ).map((file) => [file, 'onnxruntime-web'] as [string, string]),
])

/** The model and the WASM runtime are not text, and a browser will refuse the
 *  runtime outright if it is not served as `application/wasm`. */
const contentTypeFor = (file: string): string =>
  file.endsWith('.wasm')
    ? 'application/wasm'
    : file.endsWith('.onnx')
      ? 'application/octet-stream'
      : 'text/javascript; charset=utf-8'

/** No caching anywhere: the point of the page is to reload it after an edit. */
const NO_STORE = 'no-store'

export const VoiceDemoModuleInput = z.object({
  file: z.string(),
})

export const voiceDemoModule = pikkuSessionlessFunc({
  description: 'Serves one demo asset — a voice-agents module, or a VAD asset',
  readonly: true,
  input: VoiceDemoModuleInput,
  func: async (_services, { file }) => {
    const from = SERVABLE.get(file)
    if (!from) {
      return new Response(`Not a demo module: ${file}`, { status: 404 })
    }
    // Read as bytes rather than text: the same route now serves an ONNX model
    // and a WASM binary, and decoding either as UTF-8 corrupts it silently.
    const bytes = await readFile(resolve(join(distOf(from), file)))
    return new Response(bytes, {
      headers: {
        'content-type': contentTypeFor(file),
        'cache-control': NO_STORE,
      },
    })
  },
})

export const voiceDemoPage = pikkuSessionlessFunc({
  description: 'Serves the voice conversation demo page',
  readonly: true,
  func: async () =>
    new Response(PAGE, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': NO_STORE,
      },
    }),
})

export const VoiceDemoTranscribeInput = z.object({
  /** The recorded turn, base64. JSON rather than a raw body so the route needs
   *  no binary handling on either side; a few seconds of Opus is small. */
  audio: z.string(),
})

/** Drives the conversation. See the note in `voice-assistant.agent.ts`. */
const ASR_MODEL = 'deepinfra/openai/whisper-large-v3-turbo'

/**
 * Run side by side purely so the two can be compared on real audio.
 *
 * The one this replaced, so the swap keeps being checked rather than being
 * decided once on a bench of five clips. What to watch for: Nemotron dropping
 * the last word of a short turn, and Whisper opening one with a greeting
 * nobody said.
 */
const COMPARISON_MODEL =
  'deepinfra/nvidia/Nemotron-3.5-ASR-Streaming-Multilingual-0.6b'

/** Kept in step with the agent's own `voiceOutput`, so one voice is heard. */
const TTS_MODEL = 'deepinfra/hexgrad/Kokoro-82M'

/**
 * Kokoro's voices are per-language, and the wrong one is not merely accented:
 * its default American-English voice reads Chinese out character-name by
 * character-name, 9.9 seconds for a sentence `zf_xiaobei` speaks in 3.5.
 * Scripts absent here — Arabic, Cyrillic, Hangul — it has no voice for at all.
 */
const SPEAKABLE_SCRIPTS = {
  han: 'zf_xiaobei',
  kana: 'jf_alpha',
  devanagari: 'hf_alpha',
  latin: 'af_bella',
}

export const VoiceDemoTranscribeOutput = z.object({
  /** What the conversation acts on. */
  text: z.string(),
  /** Round-trip milliseconds, so latency stops being a guess. */
  asrMs: z.number(),
})

/**
 * Transcribe one turn.
 *
 * The agent could do this itself — `voiceInput` transcribes an audio attachment
 * server-side — but the browser needs the text too: it is what the user sees
 * to check whether they were heard correctly, and it is what an answer to a
 * spoken approval has to be read out of before anything is approved.
 */
export const voiceDemoTranscribe = pikkuSessionlessFunc({
  description: 'Transcribes a recorded turn for the voice demo page',
  readonly: true,
  input: VoiceDemoTranscribeInput,
  output: VoiceDemoTranscribeOutput,
  func: async ({ agentRunner }, { audio }) => {
    if (!agentRunner.transcribe) {
      throw new Error('The configured agentRunner cannot transcribe')
    }
    const startedAt = Date.now()
    const result = await agentRunner.transcribe({
      model: ASR_MODEL,
      audio: Buffer.from(audio, 'base64'),
    })

    return { text: result.text, asrMs: Date.now() - startedAt }
  },
})

export const VoiceDemoCompareInput = VoiceDemoTranscribeInput
export const VoiceDemoCompareOutput = z.object({
  comparison: z.string(),
  comparisonMs: z.number(),
})

/**
 * The same clip through Whisper, for comparison only.
 *
 * A separate route rather than a second transcription inside the one above,
 * because the turn must not wait for it. Running both together made every turn
 * cost `max(nemotron, whisper)` and the diagnostic became a latency tax — the
 * page fires this after the turn is already moving and fills the numbers in
 * when they land. Delete both this and its caller once the comparison has been
 * watched for a session or two.
 */
export const voiceDemoCompare = pikkuSessionlessFunc({
  description: 'Transcribes a turn with Whisper, for side-by-side comparison',
  readonly: true,
  input: VoiceDemoCompareInput,
  output: VoiceDemoCompareOutput,
  func: async ({ agentRunner }, { audio }) => {
    if (!agentRunner.transcribe) {
      throw new Error('The configured agentRunner cannot transcribe')
    }
    const startedAt = Date.now()
    const result = await agentRunner.transcribe({
      model: COMPARISON_MODEL,
      audio: Buffer.from(audio, 'base64'),
    })
    return { comparison: result.text, comparisonMs: Date.now() - startedAt }
  },
})

export const VoiceDemoSpeakInput = z.object({
  text: z.string(),
})

export const VoiceDemoSpeakOutput = z.object({
  audio: z.string(),
  format: z.string(),
  /**
   * Scripts the speech model cannot pronounce, when there are any. Empty audio
   * with a reason on it, rather than silence the caller has to explain — an
   * approval question that cannot be spoken has to be visibly unspoken, since
   * the whole point of it is that the user answers the sentence they were read.
   */
  unspeakable: z.array(z.string()),
})

/**
 * Speak text the model did not write.
 *
 * Only the approval question goes through here. It is synthesized with the same
 * model as the agent's own speech so the user cannot tell the sanctioned
 * sentence apart from the reply around it by voice — the wording is checked,
 * and it should not sound like a different speaker reading a disclaimer.
 */
export const voiceDemoSpeak = pikkuSessionlessFunc({
  description: 'Synthesizes an utterance for the voice demo page',
  readonly: true,
  input: VoiceDemoSpeakInput,
  output: VoiceDemoSpeakOutput,
  func: async ({ agentRunner }, { text }) => {
    if (!agentRunner.generateSpeech) {
      throw new Error('The configured agentRunner cannot generate speech')
    }
    // Must stay the same model the agent speaks with — see above.
    const unspeakable = unspeakableScripts(text, SPEAKABLE_SCRIPTS)
    if (unspeakable.length > 0) {
      return { audio: '', format: '', unspeakable }
    }
    const result = await agentRunner.generateSpeech({
      model: TTS_MODEL,
      text,
      voice: voiceForText(text, SPEAKABLE_SCRIPTS),
    })
    return {
      audio: result.audio.base64,
      format: result.audio.format,
      unspeakable: [],
    }
  },
})

export const VoiceDemoInterruptInput = z.object({
  runId: z.string(),
  reason: z.enum(['speech', 'user', 'timeout']).optional(),
})

/**
 * Stop the agent talking.
 *
 * This is what `agentInterrupt()` wraps, written out because the inspector
 * reads `func` statically and cannot see through a spread. `rpc.agent.interrupt`
 * checks the run belongs to the caller before stopping it, and resolves
 * `stopped: false` when there was nothing left to stop — racing a run that
 * finishes on its own is the normal case here, not an error.
 */
export const voiceDemoInterrupt = pikkuSessionlessFunc({
  description: 'Interrupts the run the demo page is currently listening to',
  input: VoiceDemoInterruptInput,
  func: async (_services, { runId, reason }, { rpc }) =>
    rpc.agent.interrupt(runId, reason),
})

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pikku voice agent</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font: 15px/1.55 ui-sans-serif, system-ui, sans-serif;
    max-width: 44rem; margin: 0 auto; padding: 2rem 1.25rem 4rem;
  }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  p.sub { margin: 0 0 1.5rem; opacity: .7; }
  button {
    font: inherit; padding: .5rem 1rem; border-radius: .5rem;
    border: 1px solid currentColor; background: transparent; cursor: pointer;
  }
  button[disabled] { opacity: .4; cursor: default; }
  .bar { display: flex; gap: .75rem; align-items: center; margin-bottom: 1rem; }
  .state { opacity: .7; font-size: .85rem; }
  #log { display: flex; flex-direction: column; gap: .5rem; }
  .msg { padding: .5rem .75rem; border-radius: .5rem; border: 1px solid; white-space: pre-wrap; }
  .user { border-color: #8884; }
  .agent { border-color: #4a94ff88; }
  .approval { border-color: #d4913a; }
  .note { border-color: #8884; opacity: .7; font-size: .85rem; }
  .clip { border-color: #8884; font-size: .8rem; opacity: .75; font-family: ui-monospace, monospace; white-space: pre; overflow-x: auto; }
  .clip.differs { border-color: #d4913a; opacity: 1; }
  .seg.mismatch { color: #d4913a; }
  .clip audio { width: 100%; height: 32px; margin-top: .4rem; }
  .cut { opacity: .6; font-style: italic; }
  code { font-size: .85em; }
</style>
</head>
<body>
<h1>Pikku voice agent</h1>
<p class="sub">
  Talk to <code>voice-assistant-agent</code> about the todo list. Talk over it
  to cut it off. Adding and deleting ask permission out loud.
</p>

<div class="bar">
  <button id="talk">Start talking</button>
  <span class="state" id="state">idle</span>
  <label class="state" style="margin-left:auto">
    <input type="checkbox" id="use-vad" /> Silero VAD
  </label>
</div>

<div id="log"></div>

<script type="module">
import { VoiceSession } from './voice-demo/lib/voice-session.js'
import { AudioPlaybackQueue } from './voice-demo/lib/audio-playback-queue.js'
import { spokenApproval, interpretConsent } from './voice-demo/lib/spoken-approval.js'

const AGENT = 'voiceAssistantAgent'
const threadId = crypto.randomUUID()
const resourceId = 'voice-demo'

const $log = document.getElementById('log')
const $state = document.getElementById('state')
const $talk = document.getElementById('talk')
// Not id="vad": an element id becomes a global, and \`window.vad\` is the name
// the VAD bundle publishes itself under. The checkbox got there first, the
// "already loaded?" check saw it and skipped loading, and the detector failed
// with "Cannot read properties of undefined (reading 'new')".
const $vad = document.getElementById('use-vad')

const setState = (text) => { $state.textContent = text }

const say = (kind, text) => {
  const el = document.createElement('div')
  el.className = 'msg ' + kind
  el.textContent = text
  $log.append(el)
  el.scrollIntoView({ block: 'nearest' })
  return el
}

/**
 * The captured turn, playable, with what each model made of it.
 *
 * Object URLs are never revoked: the point of the page is to scroll back and
 * listen again, and a session ends by closing the tab. Revoking them on append
 * would be tidier and would break the only feature this adds.
 */
/** Whitespace-insensitive, because Whisper pads with leading/doubled spaces. */
const words = (text) => text.trim().replace(/\\s+/g, ' ')

const attachClip = (turn, result, base64) => {
  const el = document.createElement('div')
  el.className = 'msg clip'

  const label = document.createElement('div')
  label.textContent =
    (turn.durationMs / 1000).toFixed(1) + 's audio · asr ' + result.asrMs + 'ms'
  el.append(label)

  const asrRow = document.createElement('div')
  asrRow.className = 'seg'
  asrRow.textContent = '     asr  ' + (result.text.trim() || '(nothing)')
  el.append(asrRow)

  // Deliberately after the turn has already been handed on. This is a
  // diagnostic, and a diagnostic that delays the reply is worse than no
  // diagnostic — so it lands late and edits the row in place.
  const whisperRow = document.createElement('div')
  whisperRow.className = 'seg'
  whisperRow.textContent = ' whisper  …'
  el.append(whisperRow)

  post('/voice-demo/compare', { audio: base64 })
    .then((other) => {
      const differs = words(other.comparison) !== words(result.text)
      if (differs) el.classList.add('differs')
      whisperRow.className = 'seg' + (differs ? ' mismatch' : '')
      whisperRow.textContent =
        ' whisper  ' + (other.comparison.trim() || '(nothing)') +
        '   [' + other.comparisonMs + 'ms]'
    })
    .catch(() => whisperRow.remove())

  const player = document.createElement('audio')
  player.controls = true
  player.src = URL.createObjectURL(turn.audio)
  el.append(player)

  $log.append(el)
  el.scrollIntoView({ block: 'nearest' })
}

const post = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(path + ' -> ' + response.status)
  return response.json()
}

const toBase64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const fromBase64 = (data) => {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

let session = null
let playback = null
/** The run currently streaming, so barge-in knows what to stop. */
let runId = null
/** Whether this turn started over the agent's voice. Read when it ends. */
let bargedIn = false
/** The approval we are waiting to hear an answer to. */
let awaiting = null
/** Unclear answers to the approval currently being asked. Reset by \`ask\`. */
let unclearAnswers = 0
/** Two tries, then the action is denied rather than asked about forever. */
const MAX_UNCLEAR_ANSWERS = 2

/** Speech for text the model did not write — only the approval question. */
const speak = async (text) => {
  const { audio, unspeakable } = await post('/voice-demo/speak', { text })
  if (unspeakable && unspeakable.length) {
    // Worth saying loudly here. This helper only ever speaks the approval
    // question, and an approval the user was never read is one they answer
    // from memory of what they asked for rather than from what was
    // sanctioned — which is the exact thing the verbatim wording exists to
    // prevent. Unspoken and visibly so is the only safe state.
    say('note', 'not spoken aloud yet (' + unspeakable.join(', ') + ') — read it above before answering')
    return false
  }
  await playback.enqueue({ text, audio: fromBase64(audio) })
  return true
}

/**
 * Read one SSE body, rendering text as it arrives and queueing audio behind it.
 * Returns how the turn ended so the caller knows what to ask next.
 *
 * The wire format is AG-UI, so pikku's own events arrive as \`CUSTOM\` under a
 * \`pikku:\` name — that is where speech, approvals and interruption live, since
 * AG-UI itself has no event for any of them.
 */
const consume = async (response) => {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let bubble = null
  const approvals = []
  let interrupted = false

  const handle = (event) => {
    switch (event.type) {
      case 'RUN_STARTED':
        runId = event.runId
        return
      case 'TEXT_MESSAGE_CONTENT':
        if (!bubble) bubble = say('agent', '')
        bubble.textContent += event.delta
        return
      case 'TOOL_CALL_START':
        say('note', 'calling ' + event.toolCallName)
        return
      case 'RUN_ERROR':
        say('note', 'error: ' + event.message)
        return
      case 'CUSTOM':
        break
      default:
        return
    }

    switch (event.name) {
      case 'pikku:audio-delta':
        // Queued, never awaited: the rest of the stream has to keep arriving
        // while this sentence is being spoken. A chunk that will not decode is
        // reported and skipped — one silent sentence beats a dead stream.
        playback
          .enqueue({ text: '', audio: fromBase64(event.value.data) })
          .catch(() => say('note', 'could not decode a sentence of speech'))
        return
      case 'pikku:voice-unsupported':
        // The reply is on screen either way. What this says is that the part
        // of it in this script was not read out — otherwise the silence looks
        // like the speech failed, and the user waits for audio that is not
        // coming.
        say(
          'note',
          'not spoken aloud yet: ' + event.value.scripts.join(', ')
        )
        return
      case 'pikku:approval-request':
        runId = event.value.runId ?? runId
        approvals.push(event.value)
        return
      case 'pikku:interrupted':
        // Guarded: a new run may already have announced itself while the
        // interrupted one was still shutting down, and clearing that would
        // leave the next reply with nothing to stop.
        if (runId === event.value.runId) runId = null
        if (bubble) bubble.classList.add('cut')
        interrupted = true
        return
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let index
    while ((index = buffer.indexOf('\\n\\n')) !== -1) {
      const frame = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const line = frame.split('\\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      try { handle(JSON.parse(line.slice(5).trim())) } catch {}
    }
  }
  return { approvals, interrupted }
}

const stream = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    say('note', path + ' -> ' + response.status)
    return { approvals: [], interrupted: false }
  }
  return consume(response)
}

/**
 * Ask for one approval out loud, in the function's own words.
 *
 * The sentence is never composed here and never comes from the model: it is
 * whatever \`approvalDescription\` produced, carried through untouched. On a
 * screen a wrong word is checkable against the button beside it; spoken, it is
 * the whole interface.
 */
const ask = async (approval) => {
  const prompt = spokenApproval(approval)
  say('approval', prompt.text)
  if (prompt.undescribed) {
    say('note', 'This tool supplied no approvalDescription.')
  }
  awaiting = prompt
  unclearAnswers = 0
  setState('waiting for yes or no')
  await speak(prompt.text)
}

const askAll = async (approvals) => {
  // Only the first is asked now. The server keeps a run suspended until every
  // pending approval is answered, so the rest are picked up as each resume
  // replies, and the user is never read two questions before answering one.
  if (approvals.length > 0) await ask(approvals[0])
}

const answer = async (transcript) => {
  const prompt = awaiting
  const consent = interpretConsent(transcript)

  if (consent === 'unclear') {
    unclearAnswers += 1

    // Asking again is the right response to one unclear answer and the wrong
    // response to every unclear answer: whatever is producing them — a bad
    // microphone, a room, a person who has walked away — is still producing
    // them on the next pass, and the question repeats until something breaks.
    // Giving up denies, because the only safe reading of "no answer" for an
    // action awaiting consent is that consent was not given.
    if (unclearAnswers >= MAX_UNCLEAR_ANSWERS) {
      awaiting = null
      say('note', 'No clear answer after ' + MAX_UNCLEAR_ANSWERS + ' tries — treating that as no.')
      await speak('I could not tell whether that was a yes, so I have not done it.')
      const declined = await stream('/rpc/agent/' + AGENT + '/resume', {
        agentName: AGENT,
        runId,
        toolCallId: prompt.toolCallId,
        approved: false,
      })
      await askAll(declined.approvals)
      return
    }

    // Never resolved on a guess. The same question is asked again, unchanged —
    // rewording it would mean the user answers a sentence the function never
    // sanctioned. Only the note beside it says which of the two happened,
    // because "I didn't hear you" and "that wasn't a yes" are different things
    // to fix and the user is the one who can fix them.
    say(
      'note',
      transcript
        ? 'Not a clear yes or no, so nothing was decided.'
        : 'Nothing was transcribed, so nothing was decided.'
    )
    await speak(prompt.text)
    return
  }

  awaiting = null
  say('note', consent === 'granted' ? 'approved' : 'denied')
  const outcome = await stream('/rpc/agent/' + AGENT + '/resume', {
    agentName: AGENT,
    runId,
    toolCallId: prompt.toolCallId,
    approved: consent === 'granted',
  })
  await askAll(outcome.approvals)
}

const handleTurn = async (turn, heard) => {
  setState('transcribing')
  let transcript = ''
  let result = null
  const base64 = await toBase64(turn.audio)
  try {
    result = await post('/voice-demo/transcribe', { audio: base64 })
    transcript = result.text.trim()
  } catch (error) {
    say('note', String(error.message))
  }

  // Every turn gets a playable clip and the transcript it produced, whether or
  // not anything was heard — a turn that came back empty is the interesting
  // one, because it is the only way to hear what the model was actually given.
  if (result) attachClip(turn, result, base64)

  // An empty transcript is nothing to act on — unless something is waiting to
  // be answered, in which case dropping it is what leaves the conversation
  // hung: the user says yes, the model returns nothing, and the question is
  // never asked again. Silence is not consent, but it is an answer that has to
  // be handled rather than ignored, so it goes through the same unclear path
  // as "maybe" — asked again, and denied once the retries run out.
  if (!transcript && !awaiting) {
    setState('listening')
    return
  }
  if (transcript) say('user', transcript)

  if (awaiting) {
    await answer(transcript)
    setState('listening')
    return
  }

  setState('thinking')
  // What the user actually heard before cutting in, folded into the message
  // rather than sent as context: the model has to see where its last reply
  // stopped, or it answers as though the whole sentence landed.
  const message = heard && !heard.complete
    ? transcript + '\\n\\n(You were cut off. All I heard was: "' + heard.text + '")'
    : transcript

  const outcome = await stream('/rpc/agent/' + AGENT + '/stream', {
    agentName: AGENT,
    message,
    threadId,
    resourceId,
  })
  await askAll(outcome.approvals)
  if (!awaiting) setState('listening')
}

/**
 * Stop the run now. Fires on the first audible frame — before the turn is over
 * and long before there is a transcript — because stopping the bill should not
 * wait for either.
 */
const interruptRun = async () => {
  if (!runId) return
  try {
    const { stopped, inFlightTools } = await post('/voice-demo/interrupt', {
      runId,
      reason: 'speech',
    })
    if (stopped && inFlightTools.length > 0) {
      // Named, not offered to undo — it has already happened.
      say('note', 'still finishing: ' + inFlightTools.join(', '))
    }
  } catch (error) {
    say('note', String(error.message))
  }
}

const script = (src) =>
  new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.onload = resolve
    el.onerror = () => reject(new Error('failed to load ' + src))
    document.head.append(el)
  })

/**
 * Two classic scripts, in order, because \`@ricky0123/vad-web\`'s browser build
 * is UMD and closes over a global \`ort\` that onnxruntime has to have defined
 * first. Not \`import()\`: the ESM builds of both resolve bare specifiers a
 * browser cannot, which is the same reason this page loads the voice package
 * from a route rather than from node_modules.
 */
let vadModule = null
const loadVad = () => {
  // Cached as the promise, not as a global lookup: the module publishes itself
  // on \`window\`, and asking \`window\` whether it is loaded is how this broke.
  vadModule ??= (async () => {
    await script('/voice-demo/lib/ort.wasm.min.js')
    await script('/voice-demo/lib/bundle.min.js')
    if (!window.vad?.MicVAD) throw new Error('vad bundle loaded without MicVAD')
    return window.vad
  })()
  return vadModule
}

/**
 * The Silero option. Assets come from this server rather than the library's
 * CDN, and \`redemptionMs\` matches the energy detector's 700ms rather than the
 * library's 1400 — comparing them is the point, so the only difference that
 * should show up is how the end of a turn is decided.
 */
const speechOptions = () => ({
  load: loadVad,
  baseAssetPath: '/voice-demo/lib/',
  onnxWASMBasePath: '/voice-demo/lib/',
  model: 'v5',
  redemptionMs: 700,
  // Below "yes". The library's 400 drops it, and this demo asks yes-or-no
  // questions out loud, so that is the one turn it cannot afford to lose.
  minSpeechMs: 200,
  onDiagnostics: (d) =>
    say(
      'note',
      'vad · ' + d.processor + ' · load ' + Math.round(d.loadMs) + 'ms · ' +
      'frame ' + d.meanFrameIntervalMs.toFixed(1) + 'ms · ' +
      Math.round(d.sampleRate / 1000) + 'kHz'
    ),
})

const startSession = async () => {
  // Both AudioContexts are constructed inside the click handler. On iOS Safari
  // a context created outside a user gesture starts suspended and stays that
  // way, so the agent would be silent with nothing in the console to say why.
  playback = new AudioPlaybackQueue()
  playback.onIdle = () => { if (!awaiting) setState('listening') }

  session = new VoiceSession({
    ...($vad.checked ? { speech: speechOptions() } : {}),
    onSpeechStart: () => {
      // The only sign of life on the VAD path: it decides a turn is over
      // rather than counting down to it, so onSilenceProgress never fires and
      // the state would otherwise read 'listening' through the whole turn.
      if (!playback.playing) {
        setState('hearing you')
        return
      }
      bargedIn = true
      void playback.pause()
      void interruptRun()
    },
    onSilenceProgress: (percentage) => {
      if (percentage > 0) setState('…')
    },
    onTurn: (turn) => {
      const heard = bargedIn ? playback.interrupt() : null
      bargedIn = false
      void handleTurn(turn, heard).catch((error) =>
        say('note', String(error.message))
      )
    },
    onTurnDiscarded: () => {
      // Too short to be speech. The agent was only paused, so it picks up where
      // it was — a cough must not end a reply.
      if (!awaiting && !playback.playing) setState('listening')
      if (!bargedIn) return
      bargedIn = false
      void playback.resume()
    },
    onError: (error) => say('note', String(error.message)),
  })
  await session.start()
}

$talk.addEventListener('click', async () => {
  if (session) {
    session.stop()
    void session.destroy()
    void playback.destroy()
    session = null
    playback = null
    $talk.textContent = 'Start talking'
    $vad.disabled = false
    setState('idle')
    return
  }

  $talk.disabled = true
  // Fixed for the life of the session: the detector is chosen once, in
  // \`start()\`, because loading the model is not something to do mid-sentence.
  $vad.disabled = true
  try {
    if ($vad.checked) setState('loading vad…')
    await startSession()
    $talk.textContent = 'Stop'
    setState('listening')
  } catch (error) {
    say('note', 'microphone unavailable: ' + error.message)
    session = null
    playback = null
    $vad.disabled = false
    setState('idle')
  } finally {
    $talk.disabled = false
  }
})
</script>
</body>
</html>
`
