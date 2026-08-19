import type { AgentMessage } from '@pikku/core/agent'
import type { AgentStep, AgentContentPart } from '@pikku/core/agent'
import type { ModelMessage } from 'ai'

export async function convertToSDKMessages(
  messages: AgentMessage[]
): Promise<ModelMessage[]> {
  return messages.map(convertToSDKMessage)
}

/**
 * Lifts system messages out of the prompt and onto the `system` option.
 *
 * The SDK rejects a system message inside `messages` outright and points the
 * caller at `system` instead, so context the framework injects as a system
 * message — the working memory prompt among it — only reaches the model from
 * here. It is appended after the agent's own instructions, which is the order
 * the two were assembled in.
 */
export function liftSystemMessages(
  messages: ModelMessage[],
  instructions?: string
): { system: string | undefined; messages: ModelMessage[] } {
  const system = [
    ...(instructions ? [instructions] : []),
    ...messages
      .filter((message) => message.role === 'system')
      .map((message) => String(message.content)),
  ]
  return {
    system: system.length > 0 ? system.join('\n\n') : undefined,
    messages: messages.filter((message) => message.role !== 'system'),
  }
}

function parseIfString<T>(value: T | string | null | undefined): T | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  }
  return value as T
}

function convertToSDKMessage(msg: AgentMessage): ModelMessage {
  const toolCalls = parseIfString(msg.toolCalls)
  const toolResults = parseIfString(msg.toolResults)

  switch (msg.role) {
    case 'system':
      return {
        role: 'system',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : ((msg.content ?? '') as string),
      }
    case 'user':
      if (Array.isArray(msg.content)) {
        const parts = (msg.content as AgentContentPart[])
          .map((part) => {
            switch (part.type) {
              case 'text':
                return { type: 'text' as const, text: part.text }
              case 'image':
                return {
                  type: 'image' as const,
                  image: part.url ? new URL(part.url) : part.data!,
                  mediaType: part.mediaType,
                }
              case 'file':
                return {
                  type: 'file' as const,
                  data: part.url ? new URL(part.url) : part.data!,
                  mediaType: part.mediaType!,
                  filename: part.filename,
                }
              default:
                return undefined
            }
          })
          .filter((p) => p != null)
        return { role: 'user', content: parts as any }
      }
      return { role: 'user', content: (msg.content as string) ?? '' }
    case 'assistant': {
      const textContent =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter(
                  (p): p is Extract<AgentContentPart, { type: 'text' }> =>
                    p.type === 'text'
                )
                .map((p) => p.text)
                .join('')
            : undefined
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: [
            ...(msg.reasoningContent
              ? [{ type: 'reasoning' as const, text: msg.reasoningContent }]
              : []),
            ...(textContent
              ? [{ type: 'text' as const, text: textContent }]
              : []),
            ...toolCalls.map((tc) => ({
              type: 'tool-call' as const,
              toolCallId: tc.id,
              toolName: tc.name,
              input: parseIfString(tc.args) ?? tc.args,
            })),
          ],
        }
      }
      return { role: 'assistant', content: textContent ?? '' }
    }
    case 'tool':
      return {
        role: 'tool',
        content: Array.isArray(toolResults)
          ? toolResults.map((tr) => {
              const parsed = parseIfString(tr.result) ?? tr.result
              return {
                type: 'tool-result' as const,
                toolCallId: tr.id,
                toolName: tr.name,
                // Wrapped rather than passed through, because the difference
                // matters to the model and is invisible otherwise. A result
                // saved after its run was cut off looks exactly like one the
                // model already used, so without this the only way to guess
                // which is which is the fact that a turn was interrupted — and
                // a model told to mention undelivered results guesses wrong,
                // announcing a read that was cancelled and cost nothing.
                output: msg.undelivered
                  ? {
                      type: 'json' as const,
                      value: {
                        undelivered: true,
                        note: 'This finished after the reply was cut off, so it was never reported to the user.',
                        result: parsed,
                      },
                    }
                  : { type: 'json' as const, value: parsed },
              }
            })
          : [],
      }
  }
}

export function convertFromSDKStep(step: any): AgentStep {
  return {
    usage: {
      inputTokens: step.usage?.inputTokens ?? 0,
      outputTokens: step.usage?.outputTokens ?? 0,
    },
    toolCalls: step.toolCalls?.map((tc: any) => ({
      name: tc.toolName,
      args: tc.input,
      result: JSON.stringify(
        step.toolResults?.find((tr: any) => tr.toolCallId === tc.toolCallId)
          ?.output ?? ''
      ),
    })),
  }
}
