/**
 * Report how loud the microphone is, for a level meter.
 *
 * Separate from {@link detectSilence} despite both watching the same node, and
 * the reason is the speech-detector path: that one replaces the energy detector
 * entirely, so a level taken from inside it would go dead exactly when a caller
 * opts into the better endpointer. This attaches to the source directly and is
 * armed for the whole session, so the meter reads the same either way.
 *
 * Time-domain rather than frequency-domain, and no `minDecibels`: the detector's
 * analyser deliberately floors quiet bins to zero so "is anyone talking" is a
 * yes/no, which is the wrong shape for a bar that should visibly move while
 * someone is speaking quietly.
 *
 * Returns a stop function.
 */
export const meterInput = (
  ctx: AudioContext,
  source: AudioNode,
  onLevel: (level: number) => void,
  options?: { intervalMs?: number }
): (() => void) => {
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)

  const samples = new Uint8Array(analyser.fftSize)
  // Sampled on a timer rather than per animation frame. A meter is read by an
  // eye, not by the endpointer, and 60 setState calls a second on a React tree
  // that holds a whole chat transcript is a real cost for a bar that looks
  // identical at 20.
  const interval = options?.intervalMs ?? 50
  let timer: ReturnType<typeof setInterval> | undefined
  let last = -1

  const tick = () => {
    analyser.getByteTimeDomainData(samples)
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      const deviation = (samples[i]! - 128) / 128
      sum += deviation * deviation
    }
    const rms = Math.sqrt(sum / samples.length)
    // Speech RMS sits around 0.05–0.2 on a laptop mic, so the raw value would
    // leave the bar in its first fifth and never move. The square root is the
    // usual perceptual-ish curve; the ×3 is what puts normal speech in the
    // middle of the bar rather than at the bottom of it.
    const level = Math.min(1, Math.sqrt(rms) * 3)
    // Two decimal places: the meter is drawn as a percentage width, so finer
    // changes than this cannot be seen and only cost a render.
    const rounded = Math.round(level * 100) / 100
    if (rounded === last) return
    last = rounded
    onLevel(rounded)
  }

  timer = setInterval(tick, interval)

  return () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    source.disconnect(analyser)
  }
}
