/** One synthesized utterance, paired with the text it was synthesized from. */
export interface SpeechChunk {
  /** The text this audio says. Kept alongside the audio so an interruption can
   *  report what the user actually heard, not what the agent meant to say. */
  text: string
  audio: ArrayBuffer
}

/** What the user had actually heard at the moment playback was cut off. */
export interface SpokenSoFar {
  text: string
  /** `true` when the queue had drained, i.e. nothing was cut off. */
  complete: boolean
}

/**
 * A queued utterance. The buffer is a promise because the slot is claimed
 * before the decode finishes — see {@link AudioPlaybackQueue.enqueue}.
 */
type Pending = { text: string; buffer: Promise<AudioBuffer> }

/**
 * Sequential playback of synthesized speech, built so it can be stopped
 * mid-word and asked what it got through.
 *
 * That last part is the reason this exists rather than a bare `<audio>` element.
 * When a user talks over the agent, the next turn is only coherent if the model
 * is told what the user heard — an agent that was cut off after "I'll delete the
 * staging database and" must not assume the sentence landed. Playback position
 * is the only place that information exists.
 *
 * Owns its own `AudioContext` so `pause()` can suspend playback without also
 * freezing the capture graph's analyser — the two run concurrently during
 * barge-in, and a suspended context is what makes "heard so far" stop advancing
 * for free while the user talks.
 */
export class AudioPlaybackQueue {
  private readonly ctx: AudioContext
  private readonly queue: Pending[] = []
  private spoken: string[] = []
  private current: {
    text: string
    source: AudioBufferSourceNode
    startedAt: number
    duration: number
  } | null = null
  private draining = false
  /**
   * Bumped by {@link interrupt}, so a decode that was in flight when playback
   * was cut off can tell that it belongs to a conversation that has moved on.
   * A plain `draining` flag is not enough: a new utterance enqueued straight
   * after the interrupt sets it back to `true`, and the abandoned chunk would
   * take that as permission to speak.
   */
  private generation = 0

  /** Called when the queue empties and the last chunk has finished playing. */
  onIdle?: () => void

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext()
  }

  get playing(): boolean {
    return this.current !== null
  }

  get paused(): boolean {
    return this.ctx.state === 'suspended'
  }

  /**
   * Decode and queue an utterance. Decoding happens on enqueue rather than at
   * play time so the gap between sentences is a buffer swap and not a decode —
   * a pause of a few hundred milliseconds mid-reply reads as the agent having
   * finished, and the user starts talking into it.
   *
   * The position in the queue is taken synchronously, before the decode is
   * awaited, and that ordering is the whole point. Callers enqueue without
   * awaiting so that decoding overlaps, and decode time scales with clip
   * length — so a short sentence following a long one finishes decoding first
   * and, if the slot were claimed on completion, would be spoken first. The
   * reply then plays back in a plausible-sounding but wrong order, which is
   * far harder to notice than silence.
   */
  enqueue(chunk: SpeechChunk): Promise<void> {
    const buffer = this.ctx.decodeAudioData(chunk.audio)
    this.queue.push({ text: chunk.text, buffer })
    if (!this.draining) void this.drain()
    // Resolves on decode, not on playback — unchanged from when the decode was
    // awaited here, so a caller awaiting this still means "queued", not "said".
    return buffer.then(() => undefined)
  }

  /** Suspend playback, keeping the queue intact. Safe to call when idle. */
  async pause(): Promise<void> {
    if (this.ctx.state === 'running') await this.ctx.suspend()
  }

  /** Resume after {@link pause}. */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  /**
   * Stop immediately, drop everything queued, and report what was heard.
   *
   * The in-flight utterance is reported as a character-proportional prefix of
   * its text: audio duration maps to characters linearly, which is wrong at the
   * scale of any individual word and close enough at the scale of a sentence.
   * A model reading it needs to know roughly where it was cut off, not which
   * phoneme.
   */
  interrupt(): SpokenSoFar {
    const heard = [...this.spoken]
    let complete = true

    if (this.current) {
      const { text, source, startedAt, duration } = this.current
      complete = false
      source.onended = null
      try {
        source.stop()
      } catch {
        // Already stopped by the scheduler; nothing to unwind.
      }
      const elapsed = Math.max(0, this.ctx.currentTime - startedAt)
      const fraction = duration > 0 ? Math.min(1, elapsed / duration) : 0
      const cut = text.slice(0, Math.round(text.length * fraction)).trimEnd()
      if (cut) heard.push(cut)
      this.current = null
    }

    if (this.queue.length > 0) complete = false
    this.queue.length = 0
    this.spoken = []
    this.draining = false
    this.generation++

    // Silence comes from the empty queue, not from a suspended context. Barge-in
    // reaches here via `pause()`, and leaving the context suspended would mean
    // the *next* reply decodes, queues and starts a source node that plays to
    // nobody — the conversation goes quiet from the second turn onwards.
    void this.resume()

    return { text: heard.join(' '), complete }
  }

  /** Release the audio context. The queue is unusable afterwards. */
  async destroy(): Promise<void> {
    this.interrupt()
    await this.ctx.close()
  }

  private async drain(): Promise<void> {
    this.draining = true
    const generation = this.generation
    while (this.queue.length > 0) {
      const next = this.queue.shift()
      if (!next) break
      let buffer: AudioBuffer
      try {
        buffer = await next.buffer
      } catch {
        // One sentence that will not decode should cost that sentence and no
        // more. Dropping the rest of the queue with it would take the reply
        // down over a single bad chunk.
        continue
      }
      // Checked after the await: an interrupt landing during the decode has
      // already emptied the queue, and playing this would be the agent
      // carrying on after being told to stop.
      if (this.generation !== generation) return
      await this.play({ text: next.text, buffer })
    }
    this.draining = false
    if (!this.current) this.onIdle?.()
  }

  private play(pending: { text: string; buffer: AudioBuffer }): Promise<void> {
    return new Promise((resolve) => {
      const source = this.ctx.createBufferSource()
      source.buffer = pending.buffer
      source.connect(this.ctx.destination)
      this.current = {
        text: pending.text,
        source,
        startedAt: this.ctx.currentTime,
        duration: pending.buffer.duration,
      }
      source.onended = () => {
        // `interrupt()` clears `current` and detaches this handler, so reaching
        // here means the utterance genuinely finished.
        this.spoken.push(pending.text)
        this.current = null
        resolve()
      }
      source.start()
    })
  }
}
