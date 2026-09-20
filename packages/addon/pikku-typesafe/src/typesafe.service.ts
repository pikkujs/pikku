const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const RETRY_STATUSES = new Set([429, 529])

/**
 * A question put to System One. `noul` asks for a single calibrated 0–1
 * judgment; `choice` asks which of a named set of options applies.
 *
 * `criteria` is what the number or the option *means*, not a restatement of
 * the instructions — for `noul`, what a 1 and a 0 each look like; for
 * `choice`, what each option covers. A `null` description says the option
 * name speaks for itself.
 */
export type SystemOneQuestion =
  | {
      type: 'noul'
      instructions: string
      criteria?: { true: string; false: string }
    }
  | {
      type: 'choice'
      instructions: string
      criteria: Record<string, string | null>
    }

export type SystemOneAnswer =
  | { type: 'noul'; noul: number }
  | {
      type: 'choice'
      choice: string
      probabilities: Record<string, number>
      confidence: number
    }

export interface SystemOneUsage {
  inputTokens: number
  outputTokens: number
}

export interface SystemOneResult {
  model: string
  answers: Record<string, SystemOneAnswer>
  usage: SystemOneUsage
}

/**
 * TypeSafe's System One endpoint: typed judgments and calibrated
 * probabilities rather than generated text.
 *
 * It is its own vendor with its own key, so it does not travel through
 * whatever LLM proxy the consuming app uses and its spend does not appear in
 * that proxy's accounting. `askWithUsage` returns the token counts so a
 * consumer that bills or budgets can record them itself.
 *
 * One request evaluates every question against one `state` in parallel, so
 * batching related judgments into a single `ask` is both cheaper and more
 * consistent than asking them one at a time.
 */
export class SystemOneService {
  private readonly apiKey: string
  private readonly model: string
  private readonly timeoutMs: number

  constructor(apiKey: string, model = 'jev-latest', timeoutMs = 30_000) {
    this.apiKey = apiKey
    this.model = model
    this.timeoutMs = timeoutMs
  }

  async ask(args: {
    state: unknown
    questions: Record<string, SystemOneQuestion>
  }): Promise<Record<string, SystemOneAnswer>> {
    return (await this.askWithUsage(args)).answers
  }

  async askWithUsage(args: {
    state: unknown
    questions: Record<string, SystemOneQuestion>
    model?: string
  }): Promise<SystemOneResult> {
    const body = JSON.stringify({
      state: args.state,
      model: args.model ?? this.model,
      questions: args.questions,
    })

    let lastError = 'no attempt made'
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await delay(500 * 2 ** (attempt - 1))
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (res.ok) {
        const json = (await res.json()) as {
          model: string
          answers: Record<string, SystemOneAnswer>
          usage: { input_tokens: number; output_tokens: number }
        }
        return {
          model: json.model,
          answers: json.answers,
          usage: {
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
          },
        }
      }
      lastError = `typesafe returned ${res.status}: ${(await res.text()).slice(0, 200)}`
      if (!RETRY_STATUSES.has(res.status)) break
    }
    throw new Error(lastError)
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
