import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from '@mantine/hooks'
import { ActionIcon, Tooltip } from '@pikku/mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GitCommitHorizontal, Hammer, History, ScrollText, MessageSquare, PanelLeftClose, Plus } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocation } from '../router'
import { CollapsiblePanel } from '../components/shell/CollapsiblePanel'
import { BuilderChat, useBuilderState, type BuilderState } from './BuilderChat'
import { openProjectKey, useStudioAction } from './studio'
import classes from './ChatDock.module.css'
import { useChatRefs } from './chatRefs'
import { PikkuToggle } from '../components/builder/PikkuToggle'
import { ChangesPanel } from '../components/builder/ChangesPanel'
import { CommitHistory, type GitCommitEntry } from '../components/builder/CommitHistory'
import { callSandboxControlRpc } from '../components/builder/sandboxControl'
import { KeepChanges } from './KeepChanges'
import { LogsTab } from './LogsTab'

type DockTab = 'chat' | 'changes' | 'logs' | 'history'

const HistoryTab: React.FC = () => {
  const log = useQuery({
    queryKey: ['studio', 'git-log'],
    queryFn: () => callSandboxControlRpc<{ commits: GitCommitEntry[] }>('local', 'getSandboxGitLog', { limit: 50 }),
  })
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <CommitHistory
        commits={log.data?.commits ?? []}
        loading={log.isLoading}
        error={log.error ? log.error.message : null}
      />
    </div>
  )
}

const MIN_WIDTH = 320
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 380

export function StudioChatDock() {
  const key = openProjectKey()
  const { pathname } = useLocation()
  const [open, setOpen] = useLocalStorage({ key: 'studio-chat-dock-open', defaultValue: true })
  const [width, setWidth] = useLocalStorage({ key: 'studio-chat-dock-width', defaultValue: DEFAULT_WIDTH })
  const [resizing, setResizing] = useState(false)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)
  const state = useBuilderState(key ?? '')
  const clear = useStudioAction<{ key: string }, BuilderState>('builderClear')
  const [tab, setTab] = useLocalStorage<DockTab>({ key: 'studio-chat-dock-tab', defaultValue: 'chat' })
  const queryClient = useQueryClient()
  const picked = useChatRefs().length
  const seen = useRef(picked)
  useEffect(() => {
    if (picked > seen.current) {
      setOpen(true)
      setTab('chat')
    }
    seen.current = picked
  }, [picked, setOpen, setTab])

  const stop = useCallback(() => {
    dragging.current = false
    setResizing(false)
  }, [])

  const move = useCallback(
    (clientX: number) => {
      if (!dragging.current) return
      const delta = clientX - startX.current
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta)))
    },
    [setWidth]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = true
      setResizing(true)
      startX.current = e.clientX
      startWidth.current = width
    },
    [width]
  )

  if (!key || pathname.endsWith('/builder')) return null

  const context = `The user is looking at the console page ${pathname} while asking this.`

  return (
    <>
      <CollapsiblePanel
        collapsed={!open}
        onExpand={() => setOpen(true)}
        width={width}
        expandLabel={m.studio_chat_dock_open()}
        glyph={<Hammer size={16} />}
        floating
        testId="chat-panel"
      >
        <div className={classes.body} data-testid="chat-panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              height: 'var(--screen-header-height, 48px)',
              borderBottom: '1px solid var(--app-border)',
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <PikkuToggle
                value={tab}
                onChange={setTab}
                compact
                items={[
                  { value: 'chat', label: m.studio_dock_tab_chat(), icon: <MessageSquare size={13} />, 'data-testid': 'dock-tab-chat' },
                  { value: 'changes', label: m.studio_dock_tab_changes(), icon: <GitCommitHorizontal size={13} />, 'data-testid': 'dock-tab-changes' },
                  { value: 'logs', label: m.studio_dock_tab_logs(), icon: <ScrollText size={13} />, 'data-testid': 'dock-tab-logs' },
                  { value: 'history', label: m.studio_dock_tab_history(), icon: <History size={13} />, 'data-testid': 'dock-tab-history' },
                ]}
              />
            </div>
            {tab === 'chat' && <Tooltip label={m.studio_builder_new()} withinPortal>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={m.studio_builder_new()}
                disabled={!state.data?.items.length}
                loading={clear.isPending}
                onClick={() => clear.mutate({ key })}
                data-testid="chat-dock-new"
              >
                <Plus size={14} />
              </ActionIcon>
            </Tooltip>}
            <Tooltip label={m.studio_chat_dock_close()} withinPortal>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={m.studio_chat_dock_close()}
                onClick={() => setOpen(false)}
                data-testid="chat-dock-close"
              >
                <PanelLeftClose size={14} />
              </ActionIcon>
            </Tooltip>
          </div>
          {tab === 'chat' ? (
            <BuilderChat projectKey={key} context={context} />
          ) : tab === 'changes' ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <ChangesPanel
                  onSaved={() => {
                    void queryClient.invalidateQueries({ queryKey: ['studio', 'git-log'] })
                    void queryClient.invalidateQueries({ queryKey: ['studio', 'keep', key] })
                  }}
                />
              </div>
              <KeepChanges projectKey={key} />
            </div>
          ) : tab === 'logs' ? (
            <LogsTab projectKey={key} />
          ) : (
            <HistoryTab />
          )}
        </div>
      </CollapsiblePanel>
      {open && (
        <div
          className={`${classes.resizeHandle} ${resizing ? classes.resizeHandleActive : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => move(e.clientX)}
          onPointerUp={stop}
          onPointerCancel={stop}
        />
      )}
      {resizing && (
        <div
          className={classes.resizeOverlay}
          onPointerMove={(e) => move(e.clientX)}
          onPointerUp={stop}
          onPointerCancel={stop}
        />
      )}
    </>
  )
}
