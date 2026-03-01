import type {
  AIMessage,
  AIAgentStep,
  AIContentPart,
} from '@pikku/core/ai-agent'
import type { ModelMessage } from 'ai'

export async function convertToSDKMessages(
  messages: AIMessage[]
): Promise<ModelMessage[]> {
  return messages.map(convertToSDKMessage)
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

function convertToSDKMessage(msg: AIMessage): ModelMessage {
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
        const parts = (msg.content as AIContentPart[]).map((part) => {
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
          }
        })
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
                  (p): p is Extract<AIContentPart, { type: 'text' }> =>
                    p.type === 'text'
                )
                .map((p) => p.text)
                .join('')
            : undefined
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: [
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
                output: { type: 'json' as const, value: parsed },
              }
            })
          : [],
      }
  }
}

export function convertFromSDKStep(step: any): AIAgentStep {
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
