import { createContext, useContext, useState, useMemo, type FunctionComponent } from 'react'
import Markdown from 'react-markdown'
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react'
import {
  usePikkuAgentRuntime,
  PikkuApprovalContext,
  usePikkuApproval,
  resolvePikkuToolStatus,
  type PikkuToolStatus,
  type PikkuAgentRuntimeOptions,
} from './use-pikku-agent-runtime.js'

export interface PikkuAgentChatProps extends PikkuAgentRuntimeOptions {
  emptyMessage?: string
  /** Hide tool calls from the chat display.
   *  - `true`: hide all non-approval tool calls
   *  - `string[]`: hide tool calls matching these names
   */
  hideToolCalls?: boolean | string[]
  dark?: boolean
  /** Max width of the chat content area. Defaults to 768. Set to 'none' for full width. */
  maxWidth?: number | 'none'
}

interface ChatColors {
  bg: string
  userBubble: string
  assistantBubble: string
  text: string
  textMuted: string
  border: string
  codeBg: string
  inputBg: string
  sendBg: string
  sendColor: string
  approvalBg: string
  approvalBorder: string
  successBg: string
  successColor: string
  errorBg: string
  errorColor: string
  warningBg: string
  warningColor: string
}

const lightColors: ChatColors = {
  bg: '#ffffff',
  userBubble: '#e3f2fd',
  assistantBubble: '#f5f5f5',
  text: '#1a1a1a',
  textMuted: '#888',
  border: '#ddd',
  codeBg: '#f5f5f5',
  inputBg: 'transparent',
  sendBg: '#1976d2',
  sendColor: '#fff',
  approvalBg: '#fef9e7',
  approvalBorder: '#e9a211',
  successBg: '#e8f5e9',
  successColor: '#2e7d32',
  errorBg: '#ffebee',
  errorColor: '#c62828',
  warningBg: '#fff3e0',
  warningColor: '#e65100',
}

const darkColors: ChatColors = {
  bg: 'transparent',
  userBubble: 'rgba(0, 230, 138, 0.1)',
  assistantBubble: '#1e1e2e',
  text: '#e0e0e8',
  textMuted: '#8888a0',
  border: '#2a2a3e',
  codeBg: '#0e0e16',
  inputBg: 'transparent',
  sendBg: '#00cc7a',
  sendColor: '#0a0a0f',
  approvalBg: 'rgba(233, 162, 17, 0.1)',
  approvalBorder: '#e9a211',
  successBg: 'rgba(0, 230, 138, 0.1)',
  successColor: '#00e68a',
  errorBg: 'rgba(220, 38, 38, 0.1)',
  errorColor: '#f87171',
  warningBg: 'rgba(245, 158, 11, 0.1)',
  warningColor: '#fbbf24',
}

const ColorsContext = createContext<ChatColors>(lightColors)
const HideToolCallsContext = createContext<boolean | string[] | undefined>(undefined)

function shouldHideToolCall(
  hideToolCalls: boolean | string[] | undefined,
  toolName: string
): boolean {
  if (!hideToolCalls) return false
  if (hideToolCalls === true) return true
  return hideToolCalls.includes(toolName)
}

const ToolCallDisplay: FunctionComponent<{
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: PikkuToolStatus
  addResult?: (result: unknown) => void
}> = ({ toolCallId, toolName, args, result, status, addResult }) => {
  const colors = useContext(ColorsContext)
  const hideToolCalls = useContext(HideToolCallsContext)
  const { handleApproval } = usePikkuApproval()
  const [expanded, setExpanded] = useState(false)
  const isApproval = status.type === 'requires-action'
  const approvalReason = (args as any)?.__approvalReason
  const displayArgs = { ...args }
  delete (displayArgs as any).__approvalReason
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(
    null
  )

  // Hide responded approval tool calls
  if (isApproval && responded && shouldHideToolCall(hideToolCalls, toolName)) {
    return null
  }

  // Hide non-approval tool calls
  if (!isApproval && shouldHideToolCall(hideToolCalls, toolName)) {
    return null
  }

  if (isApproval && !responded) {
    return (
      <div
        style={{
          border: `1px solid ${colors.approvalBorder}`,
          borderRadius: 6,
          padding: 12,
          margin: '4px 0',
          backgroundColor: colors.approvalBg,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
            fontWeight: 600,
            fontSize: 13,
            color: colors.text,
          }}
        >
          Approval required
        </div>
        {approvalReason && (
          <div style={{ fontSize: 13, marginBottom: 4, color: colors.text }}>{approvalReason}</div>
        )}
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
          The agent wants to call <code>{toolName}</code>
        </div>
        <pre
          style={{
            fontSize: 11,
            background: colors.codeBg,
            padding: 8,
            borderRadius: 4,
            overflow: 'auto',
            marginBottom: 8,
            color: colors.text,
          }}
        >
          {JSON.stringify(displayArgs, null, 2)}
        </pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              setResponded('approved')
              handleApproval(toolCallId, true)
              addResult?.({ approved: true })
            }}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: `1px solid ${colors.successColor}`,
              borderRadius: 4,
              background: colors.successBg,
              color: colors.successColor,
              cursor: 'pointer',
            }}
          >
            Approve
          </button>
          <button
            onClick={() => {
              setResponded('denied')
              handleApproval(toolCallId, false)
              addResult?.({ approved: false })
            }}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: `1px solid ${colors.errorColor}`,
              borderRadius: 4,
              background: colors.errorBg,
              color: colors.errorColor,
              cursor: 'pointer',
            }}
          >
            Deny
          </button>
        </div>
      </div>
    )
  }

  if (isApproval && responded) {
    return (
      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: 8,
          margin: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: colors.text,
        }}
      >
        <span style={{ fontWeight: 500 }}>{toolName}</span>
        <span
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 3,
            background: responded === 'approved' ? colors.successBg : colors.errorBg,
            color: responded === 'approved' ? colors.successColor : colors.errorColor,
          }}
        >
          {responded}
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        padding: 8,
        margin: '4px 0',
      }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: 0,
          fontSize: 13,
          color: colors.text,
        }}
      >
        <span>{expanded ? '\u25BC' : '\u25B6'}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
          {toolName}
        </span>
        {status.type === 'running' && (
          <span style={{ fontSize: 11, color: colors.textMuted }}>running...</span>
        )}
        {status.type === 'error' && (
          <span
            style={{
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: colors.errorBg,
              color: colors.errorColor,
            }}
          >
            error
          </span>
        )}
        {status.type === 'missing-credential' && (
          <span
            style={{
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: colors.warningBg,
              color: colors.warningColor,
            }}
          >
            credential required
          </span>
        )}
        {status.type === 'denied' && (
          <span
            style={{
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: colors.errorBg,
              color: colors.errorColor,
            }}
          >
            denied
          </span>
        )}
        {status.type === 'completed' && (
          <span
            style={{
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: colors.successBg,
              color: colors.successColor,
            }}
          >
            done
          </span>
        )}
      </button>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>
            Arguments:
          </div>
          <pre
            style={{
              fontSize: 11,
              background: colors.codeBg,
              padding: 8,
              borderRadius: 4,
              overflow: 'auto',
              color: colors.text,
            }}
          >
            {JSON.stringify(displayArgs, null, 2)}
          </pre>
          {result !== undefined && (
            <>
              <div
                style={{ fontSize: 12, color: colors.textMuted, marginTop: 8, marginBottom: 2 }}
              >
                Result:
              </div>
              <pre
                style={{
                  fontSize: 11,
                  background: colors.codeBg,
                  padding: 8,
                  borderRadius: 4,
                  overflow: 'auto',
                  color: colors.text,
                }}
              >
                {typeof result === 'string'
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const MarkdownText: FunctionComponent<{ text: string; colors: ChatColors }> = ({ text, colors }) => {
  const components = useMemo(() => ({
    p: ({ children }: any) => (
      <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6, color: colors.text }}>{children}</p>
    ),
    strong: ({ children }: any) => (
      <strong style={{ fontWeight: 600, color: colors.text }}>{children}</strong>
    ),
    em: ({ children }: any) => (
      <em style={{ color: colors.text }}>{children}</em>
    ),
    ul: ({ children }: any) => (
      <ul style={{ margin: '4px 0 8px', paddingLeft: 20, fontSize: 14, color: colors.text }}>{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol style={{ margin: '4px 0 8px', paddingLeft: 20, fontSize: 14, color: colors.text }}>{children}</ol>
    ),
    li: ({ children }: any) => (
      <li style={{ marginBottom: 2, lineHeight: 1.6 }}>{children}</li>
    ),
    code: ({ children, className }: any) => {
      const isBlock = className?.startsWith('language-')
      if (isBlock) {
        return (
          <pre style={{ background: colors.codeBg, padding: 10, borderRadius: 4, overflow: 'auto', margin: '4px 0 8px', fontSize: 12 }}>
            <code style={{ color: colors.text }}>{children}</code>
          </pre>
        )
      }
      return (
        <code style={{ background: colors.codeBg, padding: '1px 4px', borderRadius: 3, fontSize: 13, color: colors.text }}>
          {children}
        </code>
      )
    },
    pre: ({ children }: any) => <>{children}</>,
    h1: ({ children }: any) => <h3 style={{ margin: '8px 0 4px', fontSize: 16, fontWeight: 600, color: colors.text }}>{children}</h3>,
    h2: ({ children }: any) => <h4 style={{ margin: '8px 0 4px', fontSize: 15, fontWeight: 600, color: colors.text }}>{children}</h4>,
    h3: ({ children }: any) => <h5 style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 600, color: colors.text }}>{children}</h5>,
    a: ({ href, children }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: colors.textMuted, textDecoration: 'underline' }}>{children}</a>
    ),
  }), [colors])

  return <Markdown components={components}>{text}</Markdown>
}

const UserMessage: FunctionComponent = () => {
  const colors = useContext(ColorsContext)
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        width: '100%',
      }}
    >
      <div style={{ maxWidth: '80%' }}>
        <div
          style={{
            fontSize: 12,
            color: colors.textMuted,
            marginBottom: 4,
            textAlign: 'right',
          }}
        >
          You
        </div>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.userBubble,
          }}
        >
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => (
                <span style={{ fontSize: 14, whiteSpace: 'pre-wrap', color: colors.text }}>
                  {text}
                </span>
              ),
            }}
          />
        </div>
      </div>
    </div>
  )
}

const AssistantMessage: FunctionComponent = () => {
  const colors = useContext(ColorsContext)
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        width: '100%',
      }}
    >
      <div style={{ maxWidth: '80%' }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
          Assistant
        </div>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.assistantBubble,
          }}
        >
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => (
                <MarkdownText text={text} colors={colors} />
              ),
              tools: {
                Fallback: (props) => (
                  <ToolCallDisplay
                    toolCallId={props.toolCallId}
                    toolName={props.toolName}
                    args={props.args as Record<string, unknown>}
                    result={props.result}
                    status={resolvePikkuToolStatus(props.status, props.result)}
                    addResult={props.addResult}
                  />
                ),
              },
            }}
          />
          <MessagePrimitive.If last>
            <ThreadPrimitive.If running>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  fontSize: 13,
                  color: colors.textMuted,
                }}
              >
                Thinking...
              </div>
            </ThreadPrimitive.If>
          </MessagePrimitive.If>
        </div>
      </div>
    </div>
  )
}

const PikkuComposer: FunctionComponent<{ disabled?: boolean }> = ({
  disabled,
}) => {
  const colors = useContext(ColorsContext)
  return (
    <div style={{ padding: '8px 0 16px' }}>
      <ComposerPrimitive.Root>
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '6px 12px',
            gap: 8,
            ...(disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : {}),
          }}
        >
          <ComposerPrimitive.Input
            placeholder={disabled ? 'Respond to approval request above...' : 'Message...'}
            rows={2}
            disabled={disabled}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 14,
              fontFamily: 'inherit',
              padding: '4px 0',
              background: colors.inputBg,
              color: colors.text,
            }}
          />
          <ComposerPrimitive.Send
            disabled={disabled}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: disabled ? colors.textMuted : colors.sendBg,
              color: colors.sendColor,
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginBottom: 2,
              fontSize: 14,
            }}
          >
            &#9654;
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  )
}

export function PikkuAgentChat(props: PikkuAgentChatProps) {
  const { emptyMessage, hideToolCalls, dark, maxWidth = 768, ...runtimeOptions } = props
  const { runtime, isAwaitingApproval, pendingApprovals, handleApproval } =
    usePikkuAgentRuntime(runtimeOptions)

  const colors = dark ? darkColors : lightColors

  return (
    <ColorsContext.Provider value={colors}>
    <PikkuApprovalContext.Provider value={{ pendingApprovals, handleApproval }}>
    <HideToolCallsContext.Provider value={hideToolCalls}>
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: colors.bg,
        }}
      >
        <ThreadPrimitive.Root
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          <ThreadPrimitive.Viewport
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                maxWidth: maxWidth === 'none' ? undefined : maxWidth,
                margin: '0 auto',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <ThreadPrimitive.Empty>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 300,
                    color: colors.textMuted,
                    textAlign: 'center',
                    fontSize: 14,
                  }}
                >
                  {emptyMessage ??
                    (props.threadId
                      ? 'Send a message to start the conversation.'
                      : 'Start a new conversation.')}
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages
                components={{
                  UserMessage,
                  AssistantMessage,
                }}
              />
            </div>
          </ThreadPrimitive.Viewport>
          <div style={{ maxWidth: maxWidth === 'none' ? undefined : maxWidth, margin: '0 auto', width: '100%', padding: '0 16px' }}>
            <PikkuComposer disabled={isAwaitingApproval} />
          </div>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
    </HideToolCallsContext.Provider>
    </PikkuApprovalContext.Provider>
    </ColorsContext.Provider>
  )
}
