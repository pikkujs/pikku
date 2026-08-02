/** Tuning for {@link detectSilence}. */
export interface SilenceDetectorControl {
  /** Milliseconds of quiet that end a turn. */
  silenceDelay: number
  /**
   * The analyser's noise floor in dBFS. Bins quieter than this read exactly
   * zero, which is what makes "is anyone talking" a test for a non-zero bin
   * rather than a threshold on an amplitude average — an average is dominated
   * by whichever frequencies the room happens to be loud in, so it drifts
   * between a laptop mic and a headset. `-50` suits close-mic speech.
   */
  minDecibels: number
}

export interface SilenceDetectorHandlers {
  /** The first frame of a turn in which the user is audible. This is the
   *  barge-in trigger: it fires while the agent may still be speaking. */
  onSpeechStart?: () => void
  /** How far through the trailing pause the turn is, 0–100. Reported in coarse
   *  steps so a UI can render a countdown without a per-frame re-render. */
  onSilenceProgress?: (percentage: number) => void
  /** The pause outlasted `silenceDelay`, so the turn is over. Times are
   *  `AudioContext.currentTime`-based milliseconds since the detector started. */
  onSpeechEnd: (turn: { startedAt: number; endedAt: number }) => void
}

const PROGRESS_STEP = 10

/**
 * Watch a live microphone stream and call back when the user starts and stops
 * talking.
 *
 * Deliberately energy-based rather than model-based: deciding *when* someone
 * stopped needs no idea of *what* they said, and a word-level endpointer costs
 * a network round trip per turn to answer a question the browser can answer for
 * free in the same frame. The trade is that it cannot tell speech from a slammed
 * door — acceptable for a push-to-talk-free composer, and the caller can still
 * discard implausibly short turns.
 *
 * Returns a stop function. Stopping does not release the stream: the caller owns
 * it, because reacquiring a microphone per turn is what makes Bluetooth headsets
 * audibly renegotiate between A2DP and HFP.
 */
export const detectSilence = (
  ctx: AudioContext,
  source: AudioNode,
  handlers: SilenceDetectorHandlers,
  control: SilenceDetectorControl
): (() => void) => {
  const analyser = ctx.createAnalyser()
  analyser.minDecibels = control.minDecibels
  analyser.fftSize = 64
  source.connect(analyser)

  const bins = new Uint8Array(analyser.frequencyBinCount)
  const startedFrom = ctx.currentTime * 1000

  let speechStart = -1
  let speechEnd = -1
  let lastProgress = -1
  let stopped = false
  let frame = 0

  const loop = () => {
    if (stopped) return
    frame = requestAnimationFrame(loop)

    analyser.getByteFrequencyData(bins)
    const now = ctx.currentTime * 1000
    const audible = bins.some((v) => v !== 0)

    if (audible) {
      if (speechStart === -1) {
        speechStart = now
        handlers.onSpeechStart?.()
      }
      speechEnd = now
      if (lastProgress !== 0) {
        lastProgress = 0
        handlers.onSilenceProgress?.(0)
      }
      return
    }

    // Silence before the first word is just the user not having started, so
    // the countdown only arms once there is a turn to end.
    if (speechStart === -1) return

    const quietFor = now - speechEnd
    if (quietFor >= control.silenceDelay) {
      stop()
      handlers.onSpeechEnd({
        startedAt: speechStart - startedFrom,
        endedAt: speechEnd - startedFrom,
      })
      return
    }

    const progress = Math.min(
      100,
      Math.round((quietFor / control.silenceDelay) * 100)
    )
    if (Math.abs(progress - lastProgress) >= PROGRESS_STEP) {
      lastProgress = progress
      handlers.onSilenceProgress?.(progress)
    }
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    source.disconnect(analyser)
  }

  frame = requestAnimationFrame(loop)
  return stop
}
