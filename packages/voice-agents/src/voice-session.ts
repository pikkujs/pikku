import { meterInput } from './input-level.js'
import { detectSilence } from './silence-detector.js'
import { detectSpeech, type SpeechDetectorOptions } from './speech-detector.js'

/** A completed turn: everything the user said between speaking up and pausing. */
export interface VoiceTurn {
  /**
   * The clip, in whatever the detector in use produces: Opus in a WebM
   * container from the energy detector's `MediaRecorder`, or 16kHz mono WAV
   * from the speech model. Both are things every transcription API accepts,
   * and the `Blob`'s own `type` says which — so a caller uploading it does not
   * need to know, and one hardcoding a filename extension does.
   */
  audio: Blob
  durationMs: number
}

export interface VoiceSessionOptions {
  /** `MediaDeviceInfo.deviceId` of the input to use. Omitted means the browser
   *  default. Change it with {@link VoiceSession.setDevice}. */
  deviceId?: string
  /** Milliseconds of silence that end a turn. Defaults to 1200. */
  silenceDelay?: number
  /** Analyser noise floor in dBFS. Defaults to -50. */
  minDecibels?: number
  /**
   * Turns shorter than this are dropped instead of being emitted. Defaults to
   * 400ms. A cough or a chair creak clears the energy threshold, and
   * transcription models answer near-silence with confabulated stock phrases —
   * "Thank you.", "Thanks for watching!" — which then get sent to the agent as
   * though the user said them.
   *
   * Energy detector only. A duration floor is a proxy for "was that speech",
   * and on the {@link VoiceSessionOptions.speech} path the model answers that
   * question directly — its own `minSpeechMs` is the equivalent knob, applied
   * to the speech rather than to the elapsed time around it. Applying both
   * would mean whichever is stricter silently wins, and it would throw away
   * exactly the turns that matter most: "yes" is under 400ms, and it is the
   * whole answer to a spoken approval.
   */
  minTurnMs?: number
  /**
   * Let the caller say where turns begin and end, instead of detecting it.
   *
   * This is push-to-talk. No detector is armed, so nothing ends a turn but
   * {@link VoiceSession.finishTurn} — which is the whole point: holding a key
   * through a three-second pause is someone thinking, and any endpointer worth
   * having would cut them off. {@link VoiceSessionOptions.onSpeechStart} does
   * not fire either, so there is no barge-in on this path; the user pressing
   * the key is the barge-in, and the caller already knows they did.
   *
   * The microphone is still held open across turns — only the recorder cycles,
   * exactly as on the detected path.
   */
  manualTurns?: boolean
  /**
   * End turns with Silero VAD instead of the energy detector — "has the user
   * stopped speaking" rather than "has the room gone quiet". Opt-in, and the
   * `load` it requires is what pulls in the model, so a caller that omits this
   * pays nothing for it.
   *
   * Falls back to the energy detector, silently apart from
   * {@link VoiceSessionOptions.onError}, if the device cannot run it or the
   * model fails to load — a conversation that works worse beats one that does
   * not start. {@link VoiceSessionOptions.onSilenceProgress} does not fire on
   * this path: the model decides a turn is over rather than counting down to
   * it, so there is no progress to show.
   *
   * The clip changes too. On this path it comes from the model — 16kHz mono
   * WAV, cut at both ends — instead of a `MediaRecorder` armed the moment the
   * previous turn ended, which is Opus but carries every second of room
   * between the turns at the front. See {@link VoiceTurn.audio}.
   */
  speech?: SpeechDetectorOptions
  /** Fires on the first audible frame of a turn, while the agent may still be
   *  talking. This is the barge-in trigger. */
  onSpeechStart?: () => void
  /** 0–100 through the trailing pause, for a countdown affordance. Energy
   *  detector only — see {@link VoiceSessionOptions.speech}. */
  onSilenceProgress?: (percentage: number) => void
  /**
   * Microphone loudness, 0–1, while the session is listening. For a level
   * meter — it says nothing about whether a turn is in progress.
   *
   * Costs nothing unless asked for: the analyser is only attached when this is
   * set, so a caller that renders no meter runs no meter.
   */
  onLevel?: (level: number) => void
  /** Fires once a turn ends and passes the {@link VoiceSessionOptions.minTurnMs} floor. */
  onTurn: (turn: VoiceTurn) => void
  /** Fires when a turn ended but was too short to be speech. Distinguished from
   *  {@link VoiceSessionOptions.onTurn} so a caller that paused the agent on
   *  {@link VoiceSessionOptions.onSpeechStart} can resume it — a cough should
   *  not end the agent's reply. */
  onTurnDiscarded?: () => void
  onError?: (error: Error) => void
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

const pickMimeType = (): string | undefined =>
  MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))

/**
 * Whether Silero can run here at all.
 *
 * Deliberately shallow: the library resamples any rate to the 16kHz the model
 * wants and falls back to a `ScriptProcessor` where there is no worklet, so the
 * only hard requirement is a WASM runtime to execute the model in. Anything
 * finer-grained than this — how fast the device actually is — is not knowable
 * up front, which is what the detector's diagnostics are for.
 */
const speechDetectionSupported = (): boolean =>
  typeof WebAssembly !== 'undefined' &&
  (typeof AudioWorkletNode === 'function' ||
    typeof ScriptProcessorNode === 'function')

/**
 * A microphone that stays open across turns.
 *
 * The whole design follows from one constraint: `getUserMedia` runs exactly
 * once, in {@link start}, and the tracks are only stopped in {@link destroy}.
 * Acquiring per turn is the obvious implementation and it is the one that makes
 * Bluetooth unusable — every acquisition renegotiates the headset from A2DP to
 * the mono HFP profile, which stops any music playing, drops output quality
 * audibly, and takes long enough that the first word of the turn is missing.
 * Holding the mic open means the profile switch happens once, at the start of
 * the conversation, and the user hears one transition instead of one per turn.
 *
 * Only the `MediaRecorder` cycles per turn. It is cheap and holds no device.
 */
export class VoiceSession {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private mono: MediaStreamAudioDestinationNode | null = null
  private recorder: MediaRecorder | null = null
  private stopDetector: (() => void) | null = null
  /**
   * The speech detector, when in use. Unlike the energy detector this one is
   * armed once for the session rather than per turn — `MicVAD.new` loads a
   * model and a WASM runtime, which is not something to do between sentences.
   */
  private stopSpeech: (() => void) | null = null
  /** The level meter, when a caller asked for one. Armed per session, like the
   *  speech detector and unlike the per-turn energy detector. */
  private stopMeter: (() => void) | null = null
  /** Push-to-talk hooks into the armed recorder, set by `captureNextTurn` when
   *  {@link VoiceSessionOptions.manualTurns} is on. */
  private beginTurnNow: (() => void) | null = null
  private finishTurnNow: (() => void) | null = null
  private listening = false
  private deviceId: string | undefined

  constructor(private readonly options: VoiceSessionOptions) {
    this.deviceId = options.deviceId
  }

  get isListening(): boolean {
    return this.listening
  }

  /** Acquire the microphone (once) and begin waiting for the first turn. */
  async start(): Promise<void> {
    if (this.listening) return
    await this.acquire()
    // Before `listening`, so the first turn is armed knowing which detector it
    // has. Loading the model takes a second or two on a cold cache, and that
    // wait belongs here rather than in the middle of the user's first sentence.
    if (this.options.speech) await this.startSpeechDetector()
    this.startMeter()
    this.listening = true
    this.captureNextTurn()
  }

  /** Stop waiting for turns but keep the microphone open, so resuming does not
   *  renegotiate the device. Use this between conversations, not {@link destroy}. */
  stop(): void {
    this.listening = false
    this.endTurn()
    this.stopMeter?.()
    this.stopMeter = null
    // Nothing is listening any more, so a meter left at its last reading would
    // sit there showing a level the microphone is no longer producing.
    this.options.onLevel?.(0)
  }

  /**
   * Start recording a push-to-talk turn. No-op unless
   * {@link VoiceSessionOptions.manualTurns} is set, or if a turn is already
   * recording — a key that repeats while held must not restart the clip.
   */
  beginTurn(): void {
    this.beginTurnNow?.()
  }

  /**
   * End the push-to-talk turn and emit it, subject to the same
   * {@link VoiceSessionOptions.minTurnMs} floor as a detected one — a stray tap
   * on the key is as much a non-turn as a cough is.
   */
  finishTurn(): void {
    this.finishTurnNow?.()
  }

  /**
   * Switch input device. This is the one operation that must reacquire, so it
   * is also the one that will make a Bluetooth headset click — hence a separate
   * call the user triggers, rather than something reacted to automatically.
   */
  async setDevice(deviceId: string | undefined): Promise<void> {
    const wasListening = this.listening
    this.stop()
    await this.release()
    this.deviceId = deviceId
    if (wasListening) await this.start()
  }

  /** Release the microphone. The session is unusable afterwards. */
  async destroy(): Promise<void> {
    this.stop()
    await this.release()
  }

  private async acquire(): Promise<void> {
    if (this.stream) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: this.deviceId ? { deviceId: { exact: this.deviceId } } : true,
    })
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    // Recording the raw stream would capture whatever channel count the device
    // reports; speech models take mono, and downmixing here is cheaper than
    // uploading a stereo clip of one voice.
    const mono = ctx.createMediaStreamDestination()
    mono.channelCount = 1
    source.connect(mono)

    this.stream = stream
    this.ctx = ctx
    this.source = source
    this.mono = mono
  }

  /**
   * Bring up the speech detector, or decide we cannot and say so.
   *
   * Every failure here is non-fatal on purpose. The energy detector is already
   * wired and works everywhere; a device without WebAssembly, a CDN that will
   * not serve the model, a browser that refuses the worklet — none of those are
   * reasons for the conversation not to happen, they are reasons for it to
   * happen the other way.
   */
  private async startSpeechDetector(): Promise<void> {
    const { ctx, stream, options } = this
    if (!ctx || !stream || !options.speech) return
    if (!speechDetectionSupported()) {
      options.onError?.(
        new Error('Speech detection unsupported on this device; using silence')
      )
      return
    }
    try {
      const { stop } = await detectSpeech(
        ctx,
        stream,
        {
          onSpeechStart: () => options.onSpeechStart?.(),
          // The clip comes from the detector, not from a recorder running
          // alongside it. A recorder has to be armed before anyone speaks, so
          // everything between the turns ends up in the clip and only the end
          // is trimmed; the detector hands back the segment it actually
          // decided was speech, cut at both ends.
          // No duration floor here — see {@link VoiceSessionOptions.minTurnMs}.
          // Audio present means the model called it speech and it cleared the
          // model's own `minSpeechMs`; absent means it did not.
          onSpeechEnd: ({ startedAt, endedAt, audio }) => {
            if (!this.listening) return
            if (audio) {
              options.onTurn({ audio, durationMs: endedAt - startedAt })
            } else {
              options.onTurnDiscarded?.()
            }
          },
          onError: options.onError,
        },
        options.speech
      )
      this.stopSpeech = stop
    } catch (error) {
      // Named as a fallback rather than re-raised as-is. The conversation still
      // works after this, which is the point, and a bare error message reads as
      // "nothing happened" when in fact the other detector took over.
      const message = error instanceof Error ? error.message : String(error)
      options.onError?.(
        new Error(`Speech detection failed (${message}); using silence`)
      )
    }
  }

  private startMeter(): void {
    const { ctx, source, options } = this
    if (!ctx || !source || !options.onLevel || this.stopMeter) return
    this.stopMeter = meterInput(ctx, source, options.onLevel)
  }

  private async release(): Promise<void> {
    this.stopSpeech?.()
    this.stopSpeech = null
    this.stopMeter?.()
    this.stopMeter = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.source?.disconnect()
    await this.ctx?.close()
    this.stream = null
    this.ctx = null
    this.source = null
    this.mono = null
  }

  private endTurn(): void {
    this.stopDetector?.()
    this.stopDetector = null
    this.beginTurnNow = null
    this.finishTurnNow = null
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop()
    }
    this.recorder = null
  }

  /**
   * Arm one turn. Self-perpetuating: the detector's end-of-speech callback
   * emits the clip and immediately arms the next turn, so the session listens
   * continuously without the caller driving a loop.
   *
   * Nothing to do on the speech path — that detector is armed once for the
   * session and produces its own audio, so there is no per-turn recorder to
   * cycle.
   */
  private captureNextTurn(): void {
    const { ctx, source, mono } = this
    if (!ctx || !source || !mono || !this.listening) return
    if (this.stopSpeech) return

    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(
      mono.stream,
      mimeType ? { mimeType } : undefined
    )
    const parts: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data)
    }
    this.recorder = recorder

    let durationMs = 0
    recorder.onstop = () => {
      const audio = new Blob(parts, { type: mimeType ?? 'audio/webm' })
      if (durationMs >= (this.options.minTurnMs ?? 400)) {
        this.options.onTurn({ audio, durationMs })
      } else if (durationMs > 0) {
        this.options.onTurnDiscarded?.()
      }
      this.captureNextTurn()
    }

    if (this.options.manualTurns) {
      // Armed but not started, and no detector. The recorder waits here until
      // the caller presses the key — starting it now would put every second of
      // room between the turns into the clip.
      let startedAt = 0
      // `stop()` flips `recorder.state` to 'inactive' synchronously, but `onstop`
      // — which is what emits the clip and clears these hooks — runs a task
      // later. A press landing in that window would see 'inactive' and restart
      // the same recorder, appending the new turn to the parts array the old one
      // is about to emit: one clip holding both turns, timed from the second
      // press. The flag closes the window; `onstop` is what opens it again.
      let finished = false
      this.beginTurnNow = () => {
        if (finished || recorder.state !== 'inactive') return
        startedAt = Date.now()
        try {
          recorder.start()
        } catch (error) {
          this.options.onError?.(
            error instanceof Error ? error : new Error(String(error))
          )
        }
      }
      this.finishTurnNow = () => {
        if (finished || recorder.state === 'inactive') return
        finished = true
        // Wall clock rather than the AudioContext's: there is no detector on
        // this path to report times against, and the press and the release are
        // both wall-clock events.
        durationMs = Date.now() - startedAt
        recorder.stop()
      }
      return
    }

    this.stopDetector = detectSilence(
      ctx,
      source,
      {
        onSpeechStart: this.options.onSpeechStart,
        onSilenceProgress: this.options.onSilenceProgress,
        onSpeechEnd: ({ startedAt, endedAt }) => {
          this.stopDetector = null
          durationMs = endedAt - startedAt
          if (recorder.state !== 'inactive') recorder.stop()
        },
      },
      {
        // Dead air the user sits through on every turn before any work starts
        // at all — the one part of the round trip that is pure waiting rather
        // than something being computed, and so the cheapest to give back.
        // 700ms rides out the pause inside a sentence without being the thing
        // people notice. Raise it if turns start getting cut in half.
        silenceDelay: this.options.silenceDelay ?? 700,
        minDecibels: this.options.minDecibels ?? -50,
      }
    )

    try {
      recorder.start()
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }
}
