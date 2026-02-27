import type { AIMessage, AIAgentStep } from '@pikku/core/ai-agent'
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
      return { role: 'system', content: msg.content ?? '' }
    case 'user':
      return { role: 'user', content: msg.content ?? '' }
    case 'assistant':
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: [
            ...(msg.content
              ? [{ type: 'text' as const, text: msg.content }]
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
      return { role: 'assistant', content: msg.content ?? '' }
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
