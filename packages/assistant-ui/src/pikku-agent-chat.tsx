import { useState, type FunctionComponent } from 'react'
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react'
import {
  usePikkuAgentRuntime,
  type PikkuAgentRuntimeOptions,
} from './use-pikku-agent-runtime.js'

export interface PikkuAgentChatProps extends PikkuAgentRuntimeOptions {
  emptyMessage?: string
}

const ToolCallDisplay: FunctionComponent<{
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: { type: string }
  addResult?: (result: unknown) => void
}> = ({ toolName, args, result, status, addResult }) => {
  const [expanded, setExpanded] = useState(false)
  const isApproval = status.type === 'requires-action'
  const approvalReason = (args as any)?.__approvalReason
  const displayArgs = { ...args }
  delete (displayArgs as any).__approvalReason
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(
    null
  )

  if (isApproval && !responded) {
    return (
      <div
        style={{
          border: '1px solid #e9a211',
          borderRadius: 6,
          padding: 12,
          margin: '4px 0',
          backgroundColor: '#fef9e7',
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
          }}
        >
          Approval required
        </div>
        {approvalReason && (
          <div style={{ fontSize: 13, marginBottom: 4 }}>{approvalReason}</div>
        )}
        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
          The agent wants to call <code>{toolName}</code>
        </div>
        <pre
          style={{
            fontSize: 11,
            background: '#f5f5f5',
            padding: 8,
            borderRadius: 4,
            overflow: 'auto',
            marginBottom: 8,
          }}
        >
          {JSON.stringify(displayArgs, null, 2)}
        </pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              setResponded('approved')
              addResult?.({ approved: true })
            }}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: '1px solid #2e7d32',
              borderRadius: 4,
              background: '#e8f5e9',
              color: '#2e7d32',
              cursor: 'pointer',
            }}
          >
            Approve
          </button>
          <button
            onClick={() => {
              setResponded('denied')
              addResult?.({ approved: false })
            }}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: '1px solid #c62828',
              borderRadius: 4,
              background: '#ffebee',
              color: '#c62828',
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
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: 8,
          margin: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 500 }}>{toolName}</span>
        <span
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 3,
            background: responded === 'approved' ? '#e8f5e9' : '#ffebee',
            color: responded === 'approved' ? '#2e7d32' : '#c62828',
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
        border: '1px solid #ddd',
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
        }}
      >
        <span>{expanded ? '\u25BC' : '\u25B6'}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
          {toolName}
        </span>
        {status.type === 'running' && (
          <span style={{ fontSize: 11, color: '#888' }}>running...</span>
        )}
        {status.type === 'complete' && (
          <span
            style={{
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: '#e8f5e9',
              color: '#2e7d32',
            }}
          >
            done
          </span>
        )}
      </button>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>
            Arguments:
          </div>
          <pre
            style={{
              fontSize: 11,
              background: '#f5f5f5',
              padding: 8,
              borderRadius: 4,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(displayArgs, null, 2)}
          </pre>
          {result !== undefined && (
            <>
              <div
                style={{ fontSize: 12, color: '#888', marginTop: 8, marginBottom: 2 }}
              >
                Result:
              </div>
              <pre
                style={{
                  fontSize: 11,
                  background: '#f5f5f5',
                  padding: 8,
                  borderRadius: 4,
                  overflow: 'auto',
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

const UserMessage: FunctionComponent = () => (
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
          color: '#888',
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
          backgroundColor: '#e3f2fd',
        }}
      >
        <MessagePrimitive.Content
          components={{
            Text: ({ text }) => (
              <span style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {text}
              </span>
            ),
          }}
        />
      </div>
    </div>
  </div>
)

const AssistantMessage: FunctionComponent = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'flex-start',
      width: '100%',
    }}
  >
    <div style={{ maxWidth: '80%' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
        Assistant
      </div>
      <div
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: '#f5f5f5',
        }}
      >
        <MessagePrimitive.Content
          components={{
            Text: ({ text }) => (
              <span style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {text}
              </span>
            ),
            tools: {
              Fallback: (props) => (
                <ToolCallDisplay
                  toolName={props.toolName}
                  args={props.args as Record<string, unknown>}
                  result={props.result}
                  status={props.status}
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
                color: '#888',
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

const PikkuComposer: FunctionComponent = () => (
  <div style={{ padding: '8px 0 16px' }}>
    <ComposerPrimitive.Root>
      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '6px 12px',
          gap: 8,
        }}
      >
        <ComposerPrimitive.Input
          placeholder="Message..."
          rows={2}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: 14,
            fontFamily: 'inherit',
            padding: '4px 0',
            background: 'transparent',
          }}
        />
        <ComposerPrimitive.Send
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: '#1976d2',
            color: '#fff',
            cursor: 'pointer',
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

export function PikkuAgentChat(props: PikkuAgentChatProps) {
  const { emptyMessage, ...runtimeOptions } = props
  const runtime = usePikkuAgentRuntime(runtimeOptions)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
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
                maxWidth: 768,
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
                    color: '#888',
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
          <div style={{ maxWidth: 768, margin: '0 auto', width: '100%', padding: '0 16px' }}>
            <PikkuComposer />
          </div>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  )
}
