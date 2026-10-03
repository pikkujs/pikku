import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ActionIcon, Center, Loader, Menu, Popover, Stack, Text, Tooltip, UnstyledButton } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'
import {
  AppWindow,
  Monitor,
  Tablet,
  Smartphone,
  Paintbrush,
  Languages,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  StretchHorizontal,
  X,
  Palette,
  Component,
  MousePointerClick,
} from 'lucide-react'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'
import { usePhone } from '../lib/breakpoints'
import { usePages, fillPagePath } from '../hooks/usePages'
import { PreviewBridgeProvider, usePreviewBridge, type InspectMode } from '../components/builder/PreviewBridgeProvider'
import { DesignPanel } from '../components/builder/DesignPanel'
import { ComponentThemePanel } from '../components/builder/ComponentThemePanel'
import { ThemeSwitcherMenu } from '../components/builder/ThemeSwitcherMenu'
import { I18nPanel } from '../components/builder/I18nPanel'
import { PikkuToggle } from '../components/builder/PikkuToggle'
import { PREVIEW_IFRAME_ALLOW } from '../components/builder/previewIframe'
import { addChatRef, elementRef } from './chatRefs'
import { openProjectKey, studioCall } from './studio'
import styles from './StudioAppsPage.module.css'

type ProjectApp = { slug: string; url: string | null; state: 'starting' | 'ready' | 'failed' }

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

type PanelMode = 'off' | 'design' | 'i18n' | 'chat'

const PANEL_WIDTHS = [340, 510, 680] as const

type AppsControl = {
  id: string
  label: I18nString
  Icon: React.ComponentType<{ size?: number }>
  onClick: () => void
  active?: boolean
  disabled?: boolean
  testId: string
}

const useProjectApps = (key: string) =>
  useQuery({
    queryKey: ['studio', 'projectApps', key],
    queryFn: () => studioCall<ProjectApp[]>('projectApps', { key }),
    refetchInterval: (query) => (query.state.data?.some((app) => app.state === 'starting') ? 1500 : false),
  })

const CenterState: React.FC<{ title: I18nString; body?: I18nString; loading?: boolean; testId: string }> = ({
  title,
  body,
  loading,
  testId,
}) => (
  <Center style={{ flex: 1 }} data-testid={testId}>
    <Stack align="center" gap="xs" maw={420}>
      {loading ? <Loader size="sm" /> : <AppWindow size={36} color="var(--mantine-color-default-border)" />}
      <Text fw={600}>{title}</Text>
      {body && (
        <Text size="sm" c="dimmed" ta="center">
          {body}
        </Text>
      )}
    </Stack>
  </Center>
)

function AppsView({ projectKey }: { projectKey: string }) {
  useLocale()
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop')
  const [selectedPath, setSelectedPath] = useState('/')
  const [previewReloadKey, setPreviewReloadKey] = useState(0)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const { registerPreviewIframe, setInspectMode, subscribeElementSelect } = usePreviewBridge()
  const queryClient = useQueryClient()
  const [panelMode, setPanelMode] = useState<PanelMode>('off')
  const [designLens, setDesignLens] = useState<'theme' | 'element' | 'component'>('theme')
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [themeEpoch, setThemeEpoch] = useState(0)
  const [panelWidth, setPanelWidth] = useState<number>(PANEL_WIDTHS[0])
  const phone = usePhone()

  useEffect(() => {
    let live = false
    const unsubscribe = subscribeElementSelect((omId, tag, _rect, component) => {
      if (!live) return
      if (inspectModeRef.current === 'chat') return addChatRef(elementRef(omId, tag, component))
      setDesignLens((prev) => (prev === 'theme' ? 'element' : prev))
    })
    live = true
    return unsubscribe
  }, [subscribeElementSelect])
  const iframeInspectMode: InspectMode = panelMode === 'design' || panelMode === 'i18n' || panelMode === 'chat' ? panelMode : 'off'
  const inspectModeRef = useRef<InspectMode>(iframeInspectMode)
  inspectModeRef.current = iframeInspectMode

  const apps = useProjectApps(projectKey)
  const allPages = usePages()
  const slug = activeSlug ?? apps.data?.[0]?.slug ?? null
  const app = apps.data?.find((a) => a.slug === slug) ?? null
  const hasFrontendPreview = app?.state === 'ready' && !!app.url
  const pages = (allPages.data ?? [])
    .filter((page) => page.app === slug || page.app.endsWith(`/${slug}`))
    .map((page) => fillPagePath(page.path))
    .filter((path): path is string => !!path)
  const iframeUrl = hasFrontendPreview ? `${app!.url}${selectedPath}` : null

  useEffect(() => {
    setSelectedPath('/')
  }, [slug])

  useEffect(() => {
    setInspectMode(iframeInspectMode)
  }, [iframeInspectMode, setInspectMode])

  useEffect(() => {
    if (!hasFrontendPreview && panelMode !== 'off') setPanelMode('off')
  }, [hasFrontendPreview, panelMode])

  const togglePanel = (mode: PanelMode) => setPanelMode((current) => (current === mode ? 'off' : mode))

  const cyclePanelWidth = () =>
    setPanelWidth((current) => {
      const next = (PANEL_WIDTHS.indexOf(current as (typeof PANEL_WIDTHS)[number]) + 1) % PANEL_WIDTHS.length
      return PANEL_WIDTHS[next]
    })

  const reloadPreview = () => setPreviewReloadKey((key) => key + 1)
  const openPreviewExternally = () => {
    if (iframeUrl) window.open(iframeUrl, '_blank', 'noopener,noreferrer')
  }
  const currentPageLabel = selectedPath === '/' ? m.builder_preview_homepage() : asI18n(selectedPath)
  const viewportOptions = [
    { mode: 'desktop' as const, Icon: Monitor, label: m.builder_viewport_desktop() },
    { mode: 'tablet' as const, Icon: Tablet, label: m.builder_viewport_tablet() },
    { mode: 'mobile' as const, Icon: Smartphone, label: m.builder_viewport_mobile() },
  ]
  const activeViewportIdx = viewportOptions.findIndex((v) => v.mode === viewportMode)
  const ActiveDeviceIcon = viewportOptions[activeViewportIdx]?.Icon ?? Monitor
  const cycleViewport = () => setViewportMode(viewportOptions[(activeViewportIdx + 1) % viewportOptions.length]!.mode)

  let body: ReactNode
  if (iframeUrl) {
    const previewIframe = (
      <iframe
        key={`preview-${previewReloadKey}`}
        ref={registerPreviewIframe('builder-preview')}
        src={iframeUrl}
        allow={PREVIEW_IFRAME_ALLOW}
        className={styles.iframe}
        title={slug ?? m.builder_iframe_fallback_title()}
        onLoad={() => setInspectMode(inspectModeRef.current)}
        data-testid="app-preview-iframe"
      />
    )
    body =
      viewportMode === 'desktop' ? (
        previewIframe
      ) : (
        <div className={styles.viewportStage}>
          <div className={`${styles.deviceFrame} ${viewportMode === 'tablet' ? styles.deviceTablet : styles.deviceMobile}`}>
            {previewIframe}
          </div>
        </div>
      )
  } else if (apps.isLoading || app?.state === 'starting') {
    body = <CenterState loading title={m.studio_apps_starting()} testId="app-preview-loading" />
  } else if (app?.state === 'failed') {
    body = (
      <CenterState
        title={m.builder_preview_not_responding_title()}
        body={m.studio_apps_failed({ slug: app.slug })}
        testId="app-preview-failed"
      />
    )
  } else {
    body = <CenterState title={m.builder_no_preview_title()} body={m.builder_no_preview_subtitle()} testId="app-preview-none" />
  }

  const inspectControls: AppsControl[] = hasFrontendPreview
    ? [
        {
          id: 'design',
          label: m.nav_design(),
          Icon: Paintbrush,
          active: panelMode === 'design',
          onClick: () => togglePanel('design'),
          testId: 'inspect-design-toggle',
        },
        {
          id: 'i18n',
          label: m.nav_translations(),
          Icon: Languages,
          active: panelMode === 'i18n',
          onClick: () => togglePanel('i18n'),
          testId: 'inspect-i18n-toggle',
        },
        {
          id: 'chat',
          label: m.nav_select_for_chat(),
          Icon: MousePointerClick,
          active: panelMode === 'chat',
          onClick: () => togglePanel('chat'),
          testId: 'inspect-chat-toggle',
        },
      ]
    : []
  const chromeControls: AppsControl[] = hasFrontendPreview
    ? [
        { id: 'reload', label: m.builder_reload_preview(), Icon: RefreshCw, onClick: reloadPreview, testId: 'preview-reload' },
        {
          id: 'viewport',
          label: viewportOptions[activeViewportIdx]?.label ?? m.builder_viewport_aria(),
          Icon: ActiveDeviceIcon,
          onClick: cycleViewport,
          testId: 'preview-viewport-toggle',
        },
        {
          id: 'external',
          label: m.builder_open_in_new_tab(),
          Icon: ExternalLink,
          onClick: openPreviewExternally,
          testId: 'preview-open-external',
        },
      ]
    : []

  const pagePill = (
    <div className={styles.chromePill}>
      {pages.length > 1 ? (
        <Menu position="bottom" withinPortal>
          <Menu.Target>
            <UnstyledButton
              className={styles.chromePageButton}
              aria-label={m.builder_page_select_aria()}
              data-testid="preview-page-select"
            >
              <span className={styles.chromePageStatic}>{currentPageLabel}</span>
              <ChevronDown size={13} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown mah={360} style={{ overflowY: 'auto' }}>
            {pages.map((path) => (
              <Menu.Item key={path} onClick={() => setSelectedPath(path)}>
                {path === '/' ? m.builder_preview_homepage() : asI18n(path)}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : (
        <span className={styles.chromePageStatic} data-testid="preview-page-static">
          {currentPageLabel}
        </span>
      )}
    </div>
  )

  const controlIcon = (c: AppsControl) => (
    <Tooltip key={c.id} label={c.label} withinPortal>
      <ActionIcon
        variant={c.active ? 'filled' : 'subtle'}
        color={c.active ? undefined : 'gray'}
        size="md"
        radius="md"
        aria-label={c.label}
        onClick={c.onClick}
        disabled={c.disabled}
        data-testid={c.testId}
      >
        <c.Icon size={15} />
      </ActionIcon>
    </Tooltip>
  )

  const centerControls = hasFrontendPreview ? (
    <>
      {!phone && inspectControls.map(controlIcon)}
      {pagePill}
      {!phone && chromeControls.map(controlIcon)}
    </>
  ) : undefined

  const appSelection =
    (apps.data?.length ?? 0) > 1
      ? {
          ariaLabel: m.builder_app_select_aria(),
          value: slug ?? '',
          onChange: (next: string) => setActiveSlug(next),
          options: apps.data!.map((a) => ({ value: a.slug, label: asI18n(a.slug) })),
        }
      : undefined

  const showPanel = panelMode !== 'off' && panelMode !== 'chat'

  const inspectorHeaderNode = (
    <div className={styles.inspectorHeader} style={{ height: 'var(--screen-header-height)' }}>
      {panelMode === 'design' ? <Paintbrush size={14} /> : <Languages size={14} />}
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--app-text)' }}>
        {panelMode === 'design' ? m.nav_design() : m.nav_translations()}
      </span>
      {panelMode === 'design' && (
        <Popover
          opened={themeMenuOpen}
          onClose={() => setThemeMenuOpen(false)}
          position="bottom-start"
          offset={4}
          withinPortal
          shadow="md"
          radius={12}
          styles={{ dropdown: { padding: 6 } }}
        >
          <Popover.Target>
            <span>
              <PikkuToggle
                value={designLens}
                onChange={(lens) => {
                  setDesignLens(lens)
                  if (lens !== 'theme') setThemeMenuOpen(false)
                }}
                compact
                items={[
                  {
                    value: 'theme',
                    label: m.design_panel_mode_theme(),
                    icon: <Palette size={13} />,
                    suffix: designLens === 'theme' ? <ChevronDown size={12} /> : undefined,
                    onSuffixClick: () => setThemeMenuOpen((open) => !open),
                    'data-testid': 'design-mode-theme',
                  },
                  {
                    value: 'element',
                    label: m.design_panel_mode_element(),
                    icon: <MousePointerClick size={13} />,
                    'data-testid': 'design-mode-element',
                  },
                  {
                    value: 'component',
                    label: m.design_panel_mode_component(),
                    icon: <Component size={13} />,
                    'data-testid': 'design-mode-component',
                  },
                ]}
              />
            </span>
          </Popover.Target>
          <Popover.Dropdown>
            <ThemeSwitcherMenu
              onThemeChanged={() => {
                setThemeMenuOpen(false)
                void queryClient.invalidateQueries({ queryKey: ['sandbox-theme-spec'] })
                void queryClient.invalidateQueries({ queryKey: ['component-meta'] })
                void queryClient.invalidateQueries({ queryKey: ['sandbox-themes'] })
                setThemeEpoch((epoch) => epoch + 1)
                setPreviewReloadKey((key) => key + 1)
              }}
            />
          </Popover.Dropdown>
        </Popover>
      )}
      {!phone && (
        <Tooltip label={m.builder_adjust_width()} withinPortal>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            radius="md"
            aria-label={m.builder_adjust_width()}
            onClick={cyclePanelWidth}
            data-testid="inspect-panel-width"
          >
            <StretchHorizontal size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        radius="md"
        aria-label={m.common_close()}
        onClick={() => setPanelMode('off')}
        data-testid="inspect-panel-close"
      >
        <X size={14} />
      </ActionIcon>
    </div>
  )

  const inspectorBody =
    panelMode === 'design' ? (
      designLens === 'component' ? (
        <ComponentThemePanel key={themeEpoch} />
      ) : (
        <DesignPanel key={themeEpoch} lens={designLens} />
      )
    ) : panelMode === 'i18n' ? (
      <I18nPanel />
    ) : null

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
      <PageContainer
        noPadding
        fullWidth
        style={{ display: 'flex', flexDirection: 'column' }}
        header={<PageHeader title={m.nav_apps()} selection={appSelection} centerNode={centerControls} />}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
          }}
          data-testid="preview-card"
        >
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>{body}</div>
        </div>
      </PageContainer>
      {showPanel && !phone && (
        <div style={{ flexShrink: 0, width: panelWidth, display: 'flex', minHeight: 0, marginLeft: -8 }} data-testid="inspect-panel">
          <PageContainer noPadding fullWidth style={{ display: 'flex', flexDirection: 'column' }} header={inspectorHeaderNode}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{inspectorBody}</div>
          </PageContainer>
        </div>
      )}
    </div>
  )
}

export const StudioAppsPage: React.FC = () => {
  const key = openProjectKey()
  if (!key) return null
  return (
    <PreviewBridgeProvider>
      <AppsView projectKey={key} />
    </PreviewBridgeProvider>
  )
}
