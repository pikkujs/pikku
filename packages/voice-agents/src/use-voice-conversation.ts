import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioPlaybackQueue,
  type SpeechChunk,
  type SpokenSoFar,
} from './audio-playback-queue.js'
import { VoiceSession, type VoiceTurn } from './voice-session.js'

export interface VoiceConversationOptions {
  /**
   * A finished turn, ready to transcribe and send. `interrupted` is non-null
   * when the user talked over the agent — it holds what they actually heard
   * before being cut off, which the caller should send alongside the turn so
   * the model can see where it got to.
   */
  onTurn: (
    turn: VoiceTurn,
    context: { interrupted: SpokenSoFar | null }
  ) => void | Promise<void>
  /**
   * The user started talking while the agent was speaking. Fires within a frame
   * of the first audible sample — before the turn is over and long before there
   * is a transcript — so this is where an in-flight run is aborted.
   *
   * Playback is already paused by the time this runs. It is not yet discarded:
   * a turn that turns out to be too short to be speech resumes it instead.
   */
  onBargeIn?: () => void | Promise<void>
  deviceId?: string
  silenceDelay?: number
  minDecibels?: number
  minTurnMs?: number
  /**
   * Track microphone loudness in {@link VoiceConversation.inputLevel}.
   *
   * Off by default because it is a render every 50ms for as long as the
   * conversation lasts, and most surfaces show no meter. Turn it on with the
   * meter, not with the conversation.
   */
  meterInput?: boolean
  /**
   * Push-to-talk: turns start and end when the caller says so, via
   * {@link VoiceConversation.beginTurn} and {@link VoiceConversation.finishTurn},
   * instead of being detected. Changing this mid-conversation rebuilds the
   * session, which re-acquires the microphone — so drive it from a setting the
   * user changes, not from something that moves per turn.
   */
  holdToTalk?: boolean
  onError?: (error: Error) => void
}

export interface VoiceConversation {
  listening: boolean
  /** The agent is currently talking. */
  speaking: boolean
  /** 0–100 through the trailing pause, or `null` when not in one. */
  silenceProgress: number | null
  /** Microphone loudness, 0–1, or 0 when not listening. Always 0 unless
   *  {@link VoiceConversationOptions.meterInput} is set. */
  inputLevel: number
  error: Error | null
  start: () => Promise<void>
  stop: () => void
  setDevice: (deviceId: string | undefined) => Promise<void>
  /** Start a push-to-talk turn. Only meaningful with
   *  {@link VoiceConversationOptions.holdToTalk}. */
  beginTurn: () => void
  /** End a push-to-talk turn and send it. */
  finishTurn: () => void
  /** Queue a synthesized utterance for playback. */
  speak: (chunk: SpeechChunk) => Promise<void>
  /** Stop the agent talking now and report what was heard. */
  interrupt: () => SpokenSoFar
}

/**
 * The half-duplex voice loop: the user talks, the agent answers out loud, and
 * either can cut the other off.
 *
 * Headless on purpose. It renders nothing, knows nothing about how a turn
 * reaches a backend, and holds no chat state — so it composes with an existing
 * chat surface (assistant-ui, or anything else) rather than replacing it. The
 * caller owns transcription and transport; this owns the microphone, the
 * playback queue, and the ordering between them.
 *
 * The ordering is the substance. Barge-in pauses playback on the first audible
 * frame so the agent shuts up immediately, but only *commits* the interruption
 * when the turn ends and proves to be speech — otherwise a cough would end
 * every reply.
 */
export const useVoiceConversation = (
  options: VoiceConversationOptions
): VoiceConversation => {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [silenceProgress, setSilenceProgress] = useState<number | null>(null)
  const [inputLevel, setInputLevel] = useState(0)
  const [error, setError] = useState<Error | null>(null)

  const sessionRef = useRef<VoiceSession | null>(null)
  const playbackRef = useRef<AudioPlaybackQueue | null>(null)
  // Whether the current turn began over the agent's voice. Read when the turn
  // ends, which is why it is a ref and not state: a re-render in between would
  // lose the race with `onTurn`.
  const bargedInRef = useRef(false)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const fail = useCallback((err: unknown) => {
    const e = err instanceof Error ? err : new Error(String(err))
    setError(e)
    optionsRef.current.onError?.(e)
  }, [])

  const getPlayback = useCallback(() => {
    if (!playbackRef.current) {
      const queue = new AudioPlaybackQueue()
      queue.onIdle = () => setSpeaking(false)
      playbackRef.current = queue
    }
    return playbackRef.current
  }, [])

  const interrupt = useCallback((): SpokenSoFar => {
    const heard = playbackRef.current?.interrupt() ?? {
      text: '',
      complete: true,
    }
    setSpeaking(false)
    return heard
  }, [])

  const start = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.start()
      setListening(true)
      return
    }
    const session = new VoiceSession({
      deviceId: optionsRef.current.deviceId,
      silenceDelay: optionsRef.current.silenceDelay,
      minDecibels: optionsRef.current.minDecibels,
      minTurnMs: optionsRef.current.minTurnMs,
      manualTurns: optionsRef.current.holdToTalk,
      onLevel: optionsRef.current.meterInput ? setInputLevel : undefined,
      onSpeechStart: () => {
        setSilenceProgress(null)
        const playback = playbackRef.current
        if (!playback?.playing) return
        bargedInRef.current = true
        void playback.pause()
        void optionsRef.current.onBargeIn?.()
      },
      onSilenceProgress: (percentage) =>
        setSilenceProgress(percentage === 0 ? null : percentage),
      onTurn: (turn) => {
        setSilenceProgress(null)
        const interrupted = bargedInRef.current ? interrupt() : null
        bargedInRef.current = false
        void Promise.resolve(
          optionsRef.current.onTurn(turn, { interrupted })
        ).catch(fail)
      },
      onTurnDiscarded: () => {
        setSilenceProgress(null)
        if (!bargedInRef.current) return
        bargedInRef.current = false
        void playbackRef.current?.resume()
      },
      onError: fail,
    })
    sessionRef.current = session
    try {
      await session.start()
      setListening(true)
    } catch (err) {
      fail(err)
    }
  }, [fail, interrupt])

  const stop = useCallback(() => {
    sessionRef.current?.stop()
    setListening(false)
    setSilenceProgress(null)
    setInputLevel(0)
  }, [])

  const beginTurn = useCallback(() => sessionRef.current?.beginTurn(), [])
  const finishTurn = useCallback(() => sessionRef.current?.finishTurn(), [])

  // The mode is baked into the session at construction, so changing it has to
  // build a new one. Only on a real change: this runs on every render otherwise
  // and rebuilding the session drops the microphone.
  const holdToTalkRef = useRef(options.holdToTalk)
  useEffect(() => {
    if (holdToTalkRef.current === options.holdToTalk) return
    holdToTalkRef.current = options.holdToTalk
    const session = sessionRef.current
    if (!session) return
    const wasListening = session.isListening
    sessionRef.current = null
    void session.destroy().then(() => {
      if (wasListening) void start()
    })
  }, [options.holdToTalk, start])

  const setDevice = useCallback(
    async (deviceId: string | undefined) => {
      try {
        await sessionRef.current?.setDevice(deviceId)
      } catch (err) {
        fail(err)
      }
    },
    [fail]
  )

  const speak = useCallback(
    async (chunk: SpeechChunk) => {
      try {
        setSpeaking(true)
        await getPlayback().enqueue(chunk)
      } catch (err) {
        setSpeaking(false)
        fail(err)
      }
    },
    [fail, getPlayback]
  )

  // The microphone is released on unmount and nowhere else — see VoiceSession.
  useEffect(
    () => () => {
      void sessionRef.current?.destroy()
      void playbackRef.current?.destroy()
      sessionRef.current = null
      playbackRef.current = null
    },
    []
  )

  return {
    listening,
    speaking,
    silenceProgress,
    inputLevel,
    error,
    start,
    stop,
    setDevice,
    beginTurn,
    finishTurn,
    speak,
    interrupt,
  }
}
