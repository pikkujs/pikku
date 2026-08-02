/**
 * Turn detection by speech model, as an alternative to {@link detectSilence}.
 *
 * The energy detector answers "is anything audible", which is the wrong
 * question asked cheaply: it cannot tell a word from a door, and it ends a turn
 * on a fixed timer that has to be long enough for the pause in the middle of a
 * sentence and short enough not to be felt. This one runs Silero VAD over the
 * same microphone and answers "is anyone speaking", so the turn ends when the
 * model stops hearing speech rather than when a stopwatch runs out.
 *
 * It is not obviously the better choice, which is why both exist. It costs a
 * ~2MB model and a WASM runtime on first load, it can be defeated by the same
 * echo cancellation problem the energy detector has — synthesized speech is
 * still speech, so an agent heard through a speaker is a turn — and its own
 * default `redemptionMs` of 1400 is twice the delay it would be replacing.
 * Which one wins is a question about devices and rooms, so the shape here is
 * built for measuring rather than for switching over.
 */

/** The `@ricky0123/vad-web` surface used here, structurally. */
export interface VadModule {
  MicVAD: {
    new: (options: Record<string, unknown>) => Promise<VadInstance>
  }
  utils: {
    encodeWAV: (
      samples: Float32Array,
      format?: number,
      sampleRate?: number,
      numChannels?: number,
      bitDepth?: number
    ) => ArrayBuffer
  }
}

export interface VadInstance {
  start: () => Promise<void>
  pause: () => Promise<void>
  destroy: () => Promise<void>
}

/** What the detector learned about the device it is actually running on. */
export interface SpeechDetectorDiagnostics {
  /** The context's real rate. Silero needs 16000 and the library resamples to
   *  it, so this is the size of the resampling job, not a failure when it is
   *  not 16k. */
  sampleRate: number
  /** Which audio processor the browser could give us. `ScriptProcessor` means
   *  the deprecated main-thread path — it works, and it competes with rendering
   *  for the same thread, so a slow device shows up here first. */
  processor: 'AudioWorklet' | 'ScriptProcessor'
  /** How long the model and WASM runtime took to become usable. Paid once per
   *  session, and entirely on the first turn the user waits through. */
  loadMs: number
  /**
   * Mean wall-clock gap between processed frames. Each frame is 32ms of audio,
   * so a device keeping up sits at ~32 — this measures whether detection is
   * running behind the conversation, not what inference costs. Well above 32
   * means turns are being decided late, and on a `ScriptProcessor` device that
   * is the number that will say so.
   */
  meanFrameIntervalMs: number
  framesProcessed: number
}

export interface SpeechDetectorHandlers {
  /** First frame the model calls speech. The barge-in trigger, same as the
   *  energy detector's — it fires while the agent may still be talking. */
  onSpeechStart?: () => void
  /**
   * The turn ended. Times are milliseconds since the detector started, matching
   * `detectSilence`'s.
   *
   * `audio` is the speech itself — 16kHz mono WAV, trimmed to what the model
   * called speech plus `preSpeechPadMs` of lead-in, and nothing else. That is
   * the reason to take the audio from here rather than record the microphone
   * alongside: a recorder armed when the previous turn ended captures every
   * second of room between the turns, and transcription models answer leading
   * silence by inventing filler — "Thank you.", "*sad music*" — and bolting it
   * onto the front of what was actually said. A clip that begins where the
   * speech begins gives them nothing to invent from.
   *
   * Absent when the model decided the segment was too short to be speech. That
   * case is still reported rather than swallowed, because a caller that paused
   * the agent on `onSpeechStart` has to be told something or the agent stays
   * paused.
   */
  onSpeechEnd: (turn: {
    startedAt: number
    endedAt: number
    audio?: Blob
  }) => void
  onError?: (error: Error) => void
}

export interface SpeechDetectorOptions {
  /**
   * Loads `@ricky0123/vad-web`. Injected rather than imported so this package
   * keeps no runtime dependencies and the model stays out of the bundle of
   * every app that only wants the energy detector — most of them, since this
   * one is opt-in.
   */
  load: () => Promise<VadModule>
  /** Where `vad.worklet.bundle.min.js` and the `.onnx` are served from.
   *  Defaults to the library's CDN; set it to serve them yourself. */
  baseAssetPath?: string
  /** Where the onnxruntime-web `.wasm` files are served from. Must match the
   *  onnxruntime-web version the library was built against. */
  onnxWASMBasePath?: string
  /** `v5` is the 2024 model; the library still defaults to `legacy`. */
  model?: 'v5' | 'legacy'
  /**
   * Silence after speech before the turn is called over. The library's default
   * is 1400, which is more than twice the energy detector's 700 — worth setting
   * deliberately, because leaving it is a latency regression dressed as a
   * default.
   */
  redemptionMs?: number
  /** Audio kept from before speech was detected, so the turn does not start on
   *  the second phoneme. */
  preSpeechPadMs?: number
  /**
   * Segments shorter than this are reported as ended but not as speech. The
   * library defaults to 400, which is longer than the word "yes" — and "yes"
   * is the entire answer to a spoken approval, so a floor that drops it hangs
   * the conversation rather than tidying it up. Set it below the shortest
   * thing the user is allowed to say.
   */
  minSpeechMs?: number
  positiveSpeechThreshold?: number
  negativeSpeechThreshold?: number
  /** Called once the first turn completes, with what the device turned out to
   *  be capable of. The point of running this at all is to find out. */
  onDiagnostics?: (diagnostics: SpeechDetectorDiagnostics) => void
}

/** Matches the library's own detection, which does not expose its choice. */
const processorFor = (ctx: AudioContext): 'AudioWorklet' | 'ScriptProcessor' =>
  'audioWorklet' in ctx && typeof AudioWorkletNode === 'function'
    ? 'AudioWorklet'
    : 'ScriptProcessor'

/**
 * Watch an already-open microphone and report turns.
 *
 * Takes the caller's `stream` and `ctx` rather than opening its own. `MicVAD`
 * will call `getUserMedia` and tear the tracks down on pause if allowed to, and
 * both are exactly what a session holding a Bluetooth headset open must not do
 * — a reacquisition renegotiates the device from A2DP to mono HFP, audibly, and
 * eats the first word of the turn.
 *
 * Loading the model is the expensive part, so the returned handle lives for the
 * session and reports every turn, rather than being armed per turn like
 * {@link detectSilence}.
 */
export const detectSpeech = async (
  ctx: AudioContext,
  stream: MediaStream,
  handlers: SpeechDetectorHandlers,
  options: SpeechDetectorOptions
): Promise<{ stop: () => void }> => {
  const startedLoadingAt = Date.now()
  const { MicVAD, utils } = await options.load()

  const redemptionMs = options.redemptionMs ?? 700
  const startedFrom = ctx.currentTime * 1000
  let speechStart = -1
  let frames = 0
  let frameMsTotal = 0
  let lastFrameAt = 0
  let loadedAt = 0
  let reported = false
  let stopped = false

  const now = () => ctx.currentTime * 1000

  const endTurn = (samples?: Float32Array) => {
    // Guarded because a misfire and a real end both arrive here, and because a
    // segment can end after `stop()` if the model was mid-frame.
    if (speechStart === -1 || stopped) return
    const startedAt = speechStart
    speechStart = -1
    // The callback arrives once the redemption window has elapsed, so the
    // clock is already that far past the last speech. Reporting it raw would
    // inflate every turn by `redemptionMs`, and the caller's minimum-turn
    // floor — the thing that throws away coughs — would be measuring the
    // silence after the cough as part of it.
    handlers.onSpeechEnd({
      startedAt: startedAt - startedFrom,
      endedAt: Math.max(startedAt, now() - redemptionMs) - startedFrom,
      // The model hands back the segment it decided on, already cut at both
      // ends. `encodeWAV` only wraps it in a header — 16kHz mono, which is what
      // every speech model resamples to anyway, so nothing is lost by not
      // shipping the microphone's native rate.
      //
      // 16-bit PCM rather than the library's 32-bit float default. Nothing
      // downstream can hear the difference — the models quantise to 16 on the
      // way in — and it is four times the bytes over the wire on every turn of
      // a conversation, which is latency the user does hear.
      audio: samples
        ? new Blob([utils.encodeWAV(samples, 1, 16000, 1, 16)], {
            type: 'audio/wav',
          })
        : undefined,
    })
    if (!reported && options.onDiagnostics) {
      reported = true
      options.onDiagnostics({
        sampleRate: ctx.sampleRate,
        processor: processorFor(ctx),
        loadMs: loadedAt - startedLoadingAt,
        meanFrameIntervalMs: frames > 0 ? frameMsTotal / frames : 0,
        framesProcessed: frames,
      })
    }
  }

  const vad = await MicVAD.new({
    model: options.model ?? 'v5',
    ...(options.baseAssetPath ? { baseAssetPath: options.baseAssetPath } : {}),
    ...(options.onnxWASMBasePath
      ? { onnxWASMBasePath: options.onnxWASMBasePath }
      : {}),
    redemptionMs,
    preSpeechPadMs: options.preSpeechPadMs ?? 800,
    minSpeechMs: options.minSpeechMs ?? 400,
    positiveSpeechThreshold: options.positiveSpeechThreshold ?? 0.3,
    negativeSpeechThreshold: options.negativeSpeechThreshold ?? 0.25,

    // The three injection points that keep the microphone ours. `pauseStream`
    // defaults to stopping every track, which would release the device.
    audioContext: ctx,
    getStream: async () => stream,
    pauseStream: async () => {},
    resumeStream: async () => stream,

    // Started explicitly below, after the handlers are known to be wired.
    startOnLoad: false,

    onSpeechStart: () => {
      if (stopped) return
      speechStart = now()
      handlers.onSpeechStart?.()
    },
    onSpeechEnd: (samples: Float32Array) => endTurn(samples),
    // Too short to be speech. Reported as an ended turn with its real duration
    // but no audio: the caller's own floor then discards it, and a caller that
    // paused the agent to listen gets told to carry on.
    onVADMisfire: () => endTurn(),
    onFrameProcessed: () => {
      const at = Date.now()
      if (lastFrameAt > 0) {
        frames++
        frameMsTotal += at - lastFrameAt
      }
      lastFrameAt = at
    },
  })

  loadedAt = Date.now()

  try {
    await vad.start()
  } catch (error) {
    handlers.onError?.(
      error instanceof Error ? error : new Error(String(error))
    )
  }

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      void vad.destroy()
    },
  }
}
