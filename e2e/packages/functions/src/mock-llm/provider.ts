import { randomUUID } from 'crypto'
import { MockLanguageModelV3 } from 'ai/test'
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import { resolveScript, type MockLlmStep } from './scripts.js'

/**
 * What the agent actually sent to the model on a single call. This is the read
 * side of the harness: most assertions in the deterministic suite are about the
 * *request* (which tools were offered, what instructions were built, which
 * messages replayed) rather than about the model's reply, so they need no LLM
 * involvement at all.
 */
export type MockLlmCall = {
  /** Text of the last user message, which scenarios control and can filter on. */
  userMessage: string
  instructions: string | undefined
  messages: unknown[]
  toolNames: string[]
  toolSchemas: Record<string, unknown>
  toolChoice: unknown
  modelId: string
  temperature: number | undefined
  stepIndex: number
}

const callLog: MockLlmCall[] = []

export const getLlmCallLog = (): MockLlmCall[] => callLog

export const resetLlmCallLog = (): void => {
  callLog.length = 0
}

const USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}

/**
 * Which step of the script this call represents.
 *
 * Counted from the assistant turns that follow the *last* user message, so the
 * index restarts on every new turn in a thread rather than growing with the
 * replayed history. Deriving it from the prompt instead of from instance state
 * keeps the mock stateless.
 */
const stepIndexFromPrompt = (prompt: LanguageModelV3CallOptions['prompt']) => {
  const lastUser = prompt.map((m) => m.role).lastIndexOf('user')
  return prompt.slice(lastUser + 1).filter((m) => m.role === 'assistant').length
}

/**
 * Neither the thread nor the run id reaches the provider, so calls are
 * correlated by the user message text instead — scenarios choose that, which
 * makes it the one caller-controlled value visible from here.
 */
const userMessageFromCall = (options: LanguageModelV3CallOptions) => {
  const prompt = options.prompt
  const message = prompt[prompt.map((m) => m.role).lastIndexOf('user')]
  if (!message || typeof message.content === 'string') {
    return (message?.content as string) ?? ''
  }
  return message.content
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text'
    )
    .map((part) => part.text)
    .join('')
}

const contentForStep = (
  step: MockLlmStep
): {
  content: LanguageModelV3Content[]
  finishReason: LanguageModelV3FinishReason
} => {
  switch (step.kind) {
    case 'text':
      return {
        content: [{ type: 'text', text: step.text }],
        finishReason: { unified: 'stop', raw: 'stop' },
      }
    case 'object':
      return {
        content: [{ type: 'text', text: JSON.stringify(step.object) }],
        finishReason: { unified: 'stop', raw: 'stop' },
      }
    case 'tool':
      return {
        content: [
          {
            type: 'tool-call',
            // Unique per call: tool call ids are a primary key in AI storage, so
            // a value derived only from the tool name collides across runs.
            toolCallId: step.toolCallId ?? `mock-${randomUUID()}`,
            toolName: step.toolName,
            input: JSON.stringify(step.input ?? {}),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      }
    case 'error':
      throw new Error(step.message)
  }
}

const recordAndResolve = (
  modelName: string,
  options: LanguageModelV3CallOptions
) => {
  const script = resolveScript(modelName)
  const stepIndex = stepIndexFromPrompt(options.prompt)
  const tools = options.tools ?? []

  callLog.push({
    userMessage: userMessageFromCall(options),
    instructions: options.prompt.find((m) => m.role === 'system')?.content as
      | string
      | undefined,
    messages: options.prompt.filter((m) => m.role !== 'system'),
    toolNames: tools.map((t) => t.name),
    toolSchemas: Object.fromEntries(
      tools.map((t) => [t.name, 'inputSchema' in t ? t.inputSchema : undefined])
    ),
    toolChoice: options.toolChoice,
    modelId: modelName,
    temperature: options.temperature,
    stepIndex,
  })

  const step =
    script.steps[Math.min(stepIndex, script.steps.length - 1)] ??
    script.steps[script.steps.length - 1]!
  return contentForStep(step)
}

const buildLanguageModel = (modelName: string): LanguageModelV3 =>
  new MockLanguageModelV3({
    provider: 'mock',
    modelId: modelName,
    doGenerate: async (options) => {
      const { content, finishReason } = recordAndResolve(modelName, options)
      return { content, finishReason, usage: USAGE, warnings: [] }
    },
    doStream: async (options) => {
      const { content, finishReason } = recordAndResolve(modelName, options)
      const parts: LanguageModelV3StreamPart[] = [
        { type: 'stream-start', warnings: [] },
      ]

      for (const [index, part] of content.entries()) {
        if (part.type === 'text') {
          const id = `text-${index}`
          parts.push({ type: 'text-start', id })
          for (const word of part.text.split(/(?<= )/)) {
            parts.push({ type: 'text-delta', id, delta: word })
          }
          parts.push({ type: 'text-end', id })
        } else {
          parts.push(part as LanguageModelV3StreamPart)
        }
      }

      parts.push({ type: 'finish', finishReason, usage: USAGE })

      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part)
            controller.close()
          },
        }),
      }
    },
  })

/**
 * A callable provider, which is what `VercelAIAgentRunner.getModel` prefers for
 * language models (`isCallable(provider) -> provider(modelName)`). Being a
 * function rather than a `MockProviderV3` lets the script be selected by model
 * name at call time — `model: 'mock/tool-then-text'` — instead of being frozen
 * into a static record at construction.
 */
export const createMockLlmProvider = () => {
  const provider = (modelName: string) => buildLanguageModel(modelName)
  return provider
}
