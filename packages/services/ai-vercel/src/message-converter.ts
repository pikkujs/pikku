import type { AIMessage, AIAgentStep } from '@pikku/core/ai-agent'
import type { CoreMessage } from 'ai'

export function convertToSDKMessages(messages: AIMessage[]): CoreMessage[] {
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

function convertToSDKMessage(msg: AIMessage): CoreMessage {
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
              args: parseIfString(tc.args) ?? tc.args,
            })),
          ],
        }
      }
      return { role: 'assistant', content: msg.content ?? '' }
    case 'tool':
      return {
        role: 'tool',
        content: Array.isArray(toolResults)
          ? toolResults.map((tr) => ({
              type: 'tool-result' as const,
              toolCallId: tr.id,
              toolName: tr.name,
              result: parseIfString(tr.result) ?? tr.result,
            }))
          : [],
      }
  }
}

export function convertFromSDKStep(step: any): AIAgentStep {
  return {
    usage: {
      inputTokens: step.usage?.promptTokens ?? 0,
      outputTokens: step.usage?.completionTokens ?? 0,
    },
    toolCalls: step.toolCalls?.map((tc: any) => ({
      name: tc.toolName,
      args: tc.args,
      result: JSON.stringify(
        step.toolResults?.find((tr: any) => tr.toolCallId === tc.toolCallId)
          ?.result ?? ''
      ),
    })),
  }
}
