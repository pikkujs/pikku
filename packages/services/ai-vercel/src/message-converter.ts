import type { AIMessage, AIAgentStep } from '@pikku/core/ai-agent'
import type { CoreMessage } from 'ai'

export function convertToSDKMessages(messages: AIMessage[]): CoreMessage[] {
  return messages.map(convertToSDKMessage)
}

function convertToSDKMessage(msg: AIMessage): CoreMessage {
  switch (msg.role) {
    case 'system':
      return { role: 'system', content: msg.content ?? '' }
    case 'user':
      return { role: 'user', content: msg.content ?? '' }
    case 'assistant':
      if (msg.toolCalls?.length) {
        return {
          role: 'assistant',
          content: [
            ...(msg.content
              ? [{ type: 'text' as const, text: msg.content }]
              : []),
            ...msg.toolCalls.map((tc) => ({
              type: 'tool-call' as const,
              toolCallId: tc.id,
              toolName: tc.name,
              args: tc.args,
            })),
          ],
        }
      }
      return { role: 'assistant', content: msg.content ?? '' }
    case 'tool':
      return {
        role: 'tool',
        content:
          msg.toolResults?.map((tr) => ({
            type: 'tool-result' as const,
            toolCallId: tr.id,
            toolName: tr.name,
            result: tr.result,
          })) ?? [],
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
