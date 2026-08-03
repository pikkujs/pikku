import {
  createContext,
  useCallback,
  useContext,
  useState,
  useMemo,
  useEffect,
  useRef,
  type ComponentType,
  type FunctionComponent,
  type ReactNode,
} from 'react'
import Markdown from 'react-markdown'
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useComposerRuntime,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react'
import {
  useVoiceConversation,
  useAudioInputs,
  type VoiceConversation,
  type AudioInput,
} from '@pikku/voice-agents'
import {
  usePikkuAgentRuntime,
  PikkuApprovalContext,
  usePikkuApproval,
  resolvePikkuToolStatus,
  isVoiceMarker,
  type PikkuToolStatus,
  type PikkuAgentRuntimeOptions,
} from './use-pikku-agent-runtime.js'

export interface PikkuAgentChatProps extends PikkuAgentRuntimeOptions {
  initialPrompt?: string
  emptyMessage?: string
  /** Hide tool calls from the chat display.
   *  - `true`: hide all non-approval tool calls
   *  - `string[]`: hide tool calls matching these names
   */
  hideToolCalls?: boolean | string[]
  dark?: boolean
  /** Max width of the chat content area. Defaults to 768. Set to 'none' for full width. */
  maxWidth?: number | 'none'
  /**
   * Per-tool renderers. Map `toolName` → React component to replace the
   * default expandable tool-call box for that tool. Enables generative-UI
   * patterns: e.g. register a `renderWidget` tool on the agent and mount
   * real UI (charts, diffs, cards) inline in the assistant bubble from the
   * persisted tool-call args.
   *
   * Any tool without an entry here falls through to the default renderer
   * (which still respects `hideToolCalls` and the approval-request UI).
   */
  toolComponents?: Record<string, ToolCallMessagePartComponent>
  renderAssistantText?: (text: string) => ReactNode
  generativeUIComponents?: Record<string, ComponentType<any>>
  /**
   * Show the microphone, and speak replies aloud.
   *
   * Opt-in because it takes two things this component cannot check: the agent
   * has to be wired with `voiceInput` for the audio to be understood, and with
   * `voiceOutput` for anything to come back. A mic on an agent with neither
   * sends a clip that reaches the model as an unreadable attachment.
   */
  voice?: boolean
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
const HideToolCallsContext = createContext<boolean | string[] | undefined>(
  undefined
)
const ToolComponentsContext = createContext<
  Record<string, ToolCallMessagePartComponent> | undefined
>(undefined)
const GenerativeUIComponentsContext = createContext<
  Record<string, ComponentType<any>> | undefined
>(undefined)
const RenderAssistantTextContext = createContext<
  ((text: string) => ReactNode) | undefined
>(undefined)

/**
 * Everything the composer's microphone needs. Absent when the chat was not
 * given `voice`, which is what hides the button.
 */
interface VoiceControls {
  conversation: VoiceConversation
  devices: AudioInput[]
  deviceId: string | undefined
  selectDevice: (deviceId: string | undefined) => void
  holdToTalk: boolean
  setHoldToTalk: (hold: boolean) => void
}

const VoiceContext = createContext<VoiceControls | undefined>(undefined)

/** What the server heard for each spoken turn, keyed by its placeholder. */
const TranscriptsContext = createContext<Record<string, string>>({})

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
  const { handleApproval, pendingApprovals } = usePikkuApproval()
  const [expanded, setExpanded] = useState(false)
  const isApproval = status.type === 'requires-action'
  const approvalReason =
    (args as any)?.__approvalReason ??
    pendingApprovals.find(
      (a) => a.toolCallId === toolCallId && a.type !== 'credential-request'
    )?.reason
  const displayArgs = { ...args }
  delete (displayArgs as any).__approvalReason
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(null)

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
          <div style={{ fontSize: 13, marginBottom: 4, color: colors.text }}>
            {approvalReason}
          </div>
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
            onClick={async () => {
              setResponded('approved')
              if (await handleApproval(toolCallId, true)) {
                addResult?.({ approved: true })
              }
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
            onClick={async () => {
              setResponded('denied')
              if (await handleApproval(toolCallId, false)) {
                addResult?.({ approved: false })
              }
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
            background:
              responded === 'approved' ? colors.successBg : colors.errorBg,
            color:
              responded === 'approved'
                ? colors.successColor
                : colors.errorColor,
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
          <span style={{ fontSize: 11, color: colors.textMuted }}>
            running...
          </span>
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
          <div
            style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}
          >
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
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  marginTop: 8,
                  marginBottom: 2,
                }}
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

const MarkdownText: FunctionComponent<{ text: string; colors: ChatColors }> = ({
  text,
  colors,
}) => {
  const components = useMemo(
    () => ({
      p: ({ children }: any) => (
        <p
          style={{
            margin: '0 0 8px',
            fontSize: 14,
            lineHeight: 1.6,
            color: colors.text,
          }}
        >
          {children}
        </p>
      ),
      strong: ({ children }: any) => (
        <strong style={{ fontWeight: 600, color: colors.text }}>
          {children}
        </strong>
      ),
      em: ({ children }: any) => (
        <em style={{ color: colors.text }}>{children}</em>
      ),
      ul: ({ children }: any) => (
        <ul
          style={{
            margin: '4px 0 8px',
            paddingLeft: 20,
            fontSize: 14,
            color: colors.text,
          }}
        >
          {children}
        </ul>
      ),
      ol: ({ children }: any) => (
        <ol
          style={{
            margin: '4px 0 8px',
            paddingLeft: 20,
            fontSize: 14,
            color: colors.text,
          }}
        >
          {children}
        </ol>
      ),
      li: ({ children }: any) => (
        <li style={{ marginBottom: 2, lineHeight: 1.6 }}>{children}</li>
      ),
      code: ({ children, className }: any) => {
        const isBlock = className?.startsWith('language-')
        if (isBlock) {
          return (
            <pre
              style={{
                background: colors.codeBg,
                padding: 10,
                borderRadius: 4,
                overflow: 'auto',
                margin: '4px 0 8px',
                fontSize: 12,
              }}
            >
              <code style={{ color: colors.text }}>{children}</code>
            </pre>
          )
        }
        return (
          <code
            style={{
              background: colors.codeBg,
              padding: '1px 4px',
              borderRadius: 3,
              fontSize: 13,
              color: colors.text,
            }}
          >
            {children}
          </code>
        )
      },
      pre: ({ children }: any) => <>{children}</>,
      h1: ({ children }: any) => (
        <h3
          style={{
            margin: '8px 0 4px',
            fontSize: 16,
            fontWeight: 600,
            color: colors.text,
          }}
        >
          {children}
        </h3>
      ),
      h2: ({ children }: any) => (
        <h4
          style={{
            margin: '8px 0 4px',
            fontSize: 15,
            fontWeight: 600,
            color: colors.text,
          }}
        >
          {children}
        </h4>
      ),
      h3: ({ children }: any) => (
        <h5
          style={{
            margin: '8px 0 4px',
            fontSize: 14,
            fontWeight: 600,
            color: colors.text,
          }}
        >
          {children}
        </h5>
      ),
      a: ({ href, children }: any) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.textMuted, textDecoration: 'underline' }}
        >
          {children}
        </a>
      ),
    }),
    [colors]
  )

  return <Markdown components={components}>{text}</Markdown>
}

/**
 * A user message's text — except for a spoken turn, where the "text" is a
 * placeholder and the real words arrive from the server a moment later.
 *
 * The gap is unavoidable: the transcription happens on the server, so the run
 * has to be under way before anyone knows what was said. Rendering the wait as
 * three dots rather than as the marker keeps the placeholder out of the UI in
 * the one second it exists — and out of it entirely if the run fails before the
 * transcript lands.
 */
const UserText: FunctionComponent<{ text: string }> = ({ text }) => {
  const colors = useContext(ColorsContext)
  const transcripts = useContext(TranscriptsContext)
  const spoken = isVoiceMarker(text)
  const shown = spoken ? transcripts[text] : text

  return (
    <span
      style={{
        fontSize: 14,
        whiteSpace: 'pre-wrap',
        color: shown === undefined ? colors.textMuted : colors.text,
      }}
    >
      {shown ?? '···'}
    </span>
  )
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
              Text: ({ text }) => <UserText text={text} />,
            }}
          />
        </div>
      </div>
    </div>
  )
}

const AssistantMessage: FunctionComponent = () => {
  const colors = useContext(ColorsContext)
  const toolComponents = useContext(ToolComponentsContext)
  const generativeUIComponents = useContext(GenerativeUIComponentsContext)
  const renderAssistantText = useContext(RenderAssistantTextContext)
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
              Text: ({ text }) =>
                renderAssistantText ? (
                  <>{renderAssistantText(text)}</>
                ) : (
                  <MarkdownText text={text} colors={colors} />
                ),
              tools: {
                by_name: toolComponents,
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
              ...(generativeUIComponents
                ? {
                    generativeUI: {
                      components: generativeUIComponents,
                    },
                  }
                : {}),
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

const ComposerPrefill: FunctionComponent<{ text?: string }> = ({ text }) => {
  const composer = useComposerRuntime()
  const filled = useRef(false)
  useEffect(() => {
    if (filled.current || !text) return
    filled.current = true
    if (composer.getState().text === '') composer.setText(text)
  }, [text, composer])
  return null
}

const MicIcon: FunctionComponent<{ size?: number }> = ({ size = 15 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <path d="M12 18v4" />
  </svg>
)

/**
 * The state of the microphone, shown while it is on.
 *
 * A live level bar rather than a static "recording" light, because the failure
 * this catches is the one people cannot debug for themselves: the browser
 * handed over the wrong input and every turn comes back empty. A bar that does
 * not move while you talk says that in a second, and the device list next to it
 * is the fix.
 */
const VoiceIndicator: FunctionComponent = () => {
  const colors = useContext(ColorsContext)
  const voice = useContext(VoiceContext)
  if (!voice) return null
  const { conversation, devices, deviceId, holdToTalk, setHoldToTalk } = voice

  const row = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    fontSize: 13,
    cursor: 'pointer',
    color: colors.text,
  } as const

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        zIndex: 5,
        minWidth: 250,
        maxWidth: 320,
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        background: colors.assistantBubble,
        boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
        padding: '8px 0',
      }}
    >
      <div style={{ ...row, cursor: 'default', gap: 10 }}>
        <span
          style={{
            color: conversation.speaking ? colors.textMuted : colors.sendBg,
            display: 'flex',
          }}
        >
          <MicIcon size={16} />
        </span>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 999,
            background: colors.border,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(conversation.inputLevel * 100)}%`,
              height: '100%',
              background: colors.sendBg,
              // Fast enough to track a voice, slow enough not to strobe on the
              // 50ms sampling interval behind it.
              transition: 'width 80ms linear',
            }}
          />
        </div>
      </div>

      <div
        style={{
          padding: '2px 12px 8px',
          fontSize: 12,
          color: colors.textMuted,
        }}
      >
        {conversation.error
          ? conversation.error.message
          : conversation.speaking
            ? 'Speaking — talk to interrupt'
            : holdToTalk
              ? 'Hold the microphone to talk'
              : conversation.silenceProgress !== null
                ? 'Finishing up…'
                : 'Listening'}
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {devices.map((device) => {
        const selected = deviceId
          ? device.deviceId === deviceId
          : device.deviceId === 'default'
        return (
          <div
            key={device.deviceId}
            role="button"
            onClick={() => voice.selectDevice(device.deviceId)}
            style={row}
          >
            <span style={{ width: 14, color: colors.sendBg }}>
              {selected ? '✓' : ''}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {device.label}
            </span>
          </div>
        )
      })}

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      <div
        role="button"
        onClick={() => setHoldToTalk(!holdToTalk)}
        style={{ ...row, justifyContent: 'space-between' }}
      >
        <span>Hold to record</span>
        <span
          style={{
            width: 30,
            height: 18,
            borderRadius: 999,
            background: holdToTalk ? colors.sendBg : colors.border,
            position: 'relative',
            transition: 'background-color 150ms ease',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: holdToTalk ? 14 : 2,
              width: 14,
              height: 14,
              borderRadius: 999,
              background: '#ffffff',
              transition: 'left 150ms ease',
            }}
          />
        </span>
      </div>
    </div>
  )
}

/**
 * The microphone button, and the indicator it opens.
 *
 * Two interactions live here because the popover's "Hold to record" toggle
 * decides which one is in effect: a press-and-hold that records for exactly as
 * long as it is held, or a click that hands the turn-taking to the detector and
 * leaves the conversation running until it is clicked again.
 */
const VoiceButton: FunctionComponent<{
  primary: boolean
  disabled: boolean
}> = ({ primary, disabled }) => {
  const colors = useContext(ColorsContext)
  const voice = useContext(VoiceContext)
  const [open, setOpen] = useState(false)
  const listening = voice?.conversation.listening ?? false

  // Closed as soon as the microphone is off. The panel is a readout of a live
  // microphone, and one showing a dead level bar reads as a broken mic.
  useEffect(() => {
    if (!listening) setOpen(false)
  }, [listening])

  if (!voice) return null
  const { conversation, holdToTalk } = voice

  const press = () => {
    if (disabled) return
    if (!holdToTalk) return
    setOpen(true)
    // Ordered: the session has to exist before a turn can be begun on it,
    // and `start` is a permission prompt on the first press.
    void conversation.start().then(() => conversation.beginTurn())
  }

  const release = () => {
    if (!holdToTalk) return
    conversation.finishTurn()
  }

  const click = () => {
    if (disabled || holdToTalk) return
    if (listening) {
      conversation.stop()
      setOpen(false)
      return
    }
    setOpen(true)
    void conversation.start()
  }

  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      {open && <VoiceIndicator />}
      <button
        type="button"
        aria-label={listening ? 'Stop voice chat' : 'Start voice chat'}
        aria-pressed={listening}
        disabled={disabled}
        onClick={click}
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          border: `1px solid ${listening ? colors.sendBg : colors.border}`,
          background: listening
            ? colors.sendBg
            : primary
              ? '#e8e8e8'
              : 'transparent',
          color: listening
            ? colors.sendColor
            : primary
              ? '#111111'
              : colors.textMuted,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition:
            'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
        }}
      >
        <MicIcon />
      </button>
    </div>
  )
}

const PikkuComposer: FunctionComponent<{ disabled?: boolean }> = ({
  disabled,
}) => {
  const colors = useContext(ColorsContext)
  const voice = useContext(VoiceContext)
  const composer = useComposerRuntime()
  const [empty, setEmpty] = useState(true)

  // Which of the two buttons is the primary one follows what is in the box:
  // with something typed the send arrow is the obvious next action, and with
  // nothing typed it does nothing at all, so the microphone takes the slot.
  useEffect(() => {
    setEmpty(composer.getState().text.trim() === '')
    return composer.subscribe(() =>
      setEmpty(composer.getState().text.trim() === '')
    )
  }, [composer])

  return (
    <div style={{ padding: '8px 0 16px' }}>
      <ComposerPrimitive.Root>
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            backgroundColor: colors.assistantBubble,
            border: `1px solid ${colors.border}`,
            borderRadius: 24,
            padding: '14px 12px 10px',
            boxShadow:
              darkColors.text === colors.text
                ? '0 14px 30px rgba(0,0,0,0.24)'
                : '0 14px 30px rgba(0,0,0,0.08)',
            ...(disabled
              ? { opacity: 0.5, pointerEvents: 'none' as const }
              : {}),
          }}
        >
          <ComposerPrimitive.Input
            placeholder={
              disabled ? 'Respond to approval request above...' : 'Message...'
            }
            rows={1}
            disabled={disabled ?? false}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: colors.text,
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'none',
              lineHeight: 1.5,
              overflowY: 'auto',
            }}
          />
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              justifyContent: 'flex-end',
            }}
          >
            {voice && (
              <VoiceButton primary={empty} disabled={disabled ?? false} />
            )}
            {/* Kept mounted with nothing typed rather than removed, so the row
                does not reflow under the cursor on the first keystroke. */}
            <ComposerPrimitive.Send
              disabled={disabled ?? false}
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                border: `1px solid ${colors.border}`,
                background: empty && voice ? 'transparent' : '#e8e8e8',
                color: empty && voice ? colors.textMuted : '#111111',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition:
                  'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
              }}
            >
              ↑
            </ComposerPrimitive.Send>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  )
}

/**
 * Ties the microphone to the agent: recorded turns go out as runs, and the
 * audio the agent sends back is played.
 *
 * Kept in one hook because the two halves have to know about each other. A
 * turn that starts while the agent is talking is a barge-in, and answering it
 * correctly means stopping playback, telling the server to abandon the rest of
 * the reply, and reporting how far the user actually got.
 */
const useChatVoice = (
  enabled: boolean,
  runtimeOptions: PikkuAgentRuntimeOptions
) => {
  const [holdToTalk, setHoldToTalk] = useState(false)
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const { devices, refresh } = useAudioInputs()
  // Assigned below; the conversation and the runtime each need the other, and
  // this is the seam that lets them be created in either order.
  const sendRef = useRef<((audio: Blob) => Promise<string>) | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  const conversation = useVoiceConversation({
    deviceId,
    holdToTalk,
    meterInput: enabled,
    onTurn: async (turn) => {
      await sendRef.current?.(turn.audio)
    },
    // Talking over the agent stops the run, not just the sound. Left running,
    // the server keeps generating — and keeps synthesizing and billing for —
    // sentences of a reply nobody is listening to any more.
    onBargeIn: () => cancelRef.current?.(),
    onError: () => {},
  })

  const runtimeResult = usePikkuAgentRuntime(runtimeOptions, {
    onAudio: ({ data, format, text }) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      // `format` is carried for the caller's sake; decoding is by content, and
      // every format the speech providers return is one the browser sniffs.
      void conversation.speak({
        text: text ?? '',
        audio: bytes.buffer as ArrayBuffer,
      })
      void format
    },
  })
  sendRef.current = runtimeResult.sendVoiceTurn
  cancelRef.current = () => {
    if (runtimeResult.runtime.thread.getState().isRunning) {
      runtimeResult.runtime.thread.cancelRun()
    }
  }

  // Device labels are empty until the page has microphone permission, and
  // nothing fires when that permission is granted — so the list is re-read the
  // first time a conversation is actually running.
  const listening = conversation.listening
  useEffect(() => {
    if (listening) void refresh()
  }, [listening, refresh])

  const selectDevice = useCallback(
    (next: string | undefined) => {
      setDeviceId(next)
      void conversation.setDevice(next)
    },
    [conversation]
  )

  const controls = useMemo<VoiceControls | undefined>(
    () =>
      enabled
        ? {
            conversation,
            devices,
            deviceId,
            selectDevice,
            holdToTalk,
            setHoldToTalk,
          }
        : undefined,
    [enabled, conversation, devices, deviceId, selectDevice, holdToTalk]
  )

  return { ...runtimeResult, voiceControls: controls }
}

export function PikkuAgentChat(props: PikkuAgentChatProps) {
  const {
    emptyMessage,
    hideToolCalls,
    dark,
    maxWidth = 768,
    toolComponents,
    renderAssistantText,
    generativeUIComponents,
    initialPrompt,
    voice,
    ...runtimeOptions
  } = props
  const {
    runtime,
    isAwaitingApproval,
    pendingApprovals,
    handleApproval,
    transcripts,
    voiceControls,
  } = useChatVoice(voice ?? false, runtimeOptions)

  const colors = dark ? darkColors : lightColors

  return (
    <ColorsContext.Provider value={colors}>
      <PikkuApprovalContext.Provider
        value={{ pendingApprovals, handleApproval }}
      >
        <HideToolCallsContext.Provider value={hideToolCalls}>
          <ToolComponentsContext.Provider value={toolComponents}>
            <GenerativeUIComponentsContext.Provider
              value={generativeUIComponents}
            >
              <RenderAssistantTextContext.Provider value={renderAssistantText}>
                <VoiceContext.Provider value={voiceControls}>
                  <TranscriptsContext.Provider value={transcripts}>
                    <AssistantRuntimeProvider runtime={runtime}>
                      <ComposerPrefill text={initialPrompt} />
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
                                maxWidth:
                                  maxWidth === 'none' ? undefined : maxWidth,
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
                          <div
                            style={{
                              maxWidth:
                                maxWidth === 'none' ? undefined : maxWidth,
                              margin: '0 auto',
                              width: '100%',
                              padding: '0 16px',
                            }}
                          >
                            <PikkuComposer disabled={isAwaitingApproval} />
                          </div>
                        </ThreadPrimitive.Root>
                      </div>
                    </AssistantRuntimeProvider>
                  </TranscriptsContext.Provider>
                </VoiceContext.Provider>
              </RenderAssistantTextContext.Provider>
            </GenerativeUIComponentsContext.Provider>
          </ToolComponentsContext.Provider>
        </HideToolCallsContext.Provider>
      </PikkuApprovalContext.Provider>
    </ColorsContext.Provider>
  )
}
