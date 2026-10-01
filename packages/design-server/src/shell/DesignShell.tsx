// ─────────────────────────────────────────────────────────────────────────────
// DesignShell — the whole Design surface that lives under the console's page
// header. Library / App / Artifact are LENSES of one shell: a segmented
// switch → a persistent left menu → a detail panel (the existing per-lens views,
// rendering the user's components under the user theme). Theme EDITING is not in
// here: this shell is embedded in the console's builder, whose Design panel edits
// the theme (and any picked element) on the right. The shell only READS the saved
// theme list the console broadcasts, so there is one theme editor, not two.
//
// This renders under the OUTER (console) Mantine provider; only the previews
// inside the views' PreviewProvider carry the user's theme.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { Box } from '@mantine/core'
import type { MantineThemeOverride } from '@mantine/core'
import { Palette } from 'lucide-react'
import { buildTheme } from '@project/mantine-themes'
import { libraryItems, appItems, catalog, type DesignArtifact } from '@/lib/discovery'
import { Plus } from 'lucide-react'
import { LibraryView } from '@/views/LibraryView'
import { AppView } from '@/views/AppView'
import { ArtifactView } from '@/artifact/ArtifactView'
import {
  reportCatalog,
  reportArtifacts,
  requestComponentStories,
  requestDeleteArtifact,
  requestDesignAgent,
} from '@/lib/host'
import { MONO, ShellMenuLabel } from './chrome'
import { m } from '@/lib/i18n'
import { LENSES, ShellMenuRow, type Lens } from './ShellMenu'
import { ShellToggle } from './ShellToggle'
import { ArtifactDialog } from './ArtifactDialog'
import { useArtifacts } from './useArtifacts'
import { useConsoleThemes } from './themeBridge'

// Group an ordered item list by a `group` field, preserving first-seen order.
function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const out: [string, T[]][] = []
  const idx = new Map<string, number>()
  for (const it of items) {
    const g = key(it)
    if (!idx.has(g)) {
      idx.set(g, out.length)
      out.push([g, []])
    }
    out[idx.get(g)!][1].push(it)
  }
  return out
}

export function DesignShell({
  colorScheme,
  initialLens,
  initialSection,
  // False when the host owns the nav (`chrome=off`): the lens switch and the left
  // menu are then the console's own left panel card, and this shell is the detail
  // pane only. It still owns discovery, so it PUBLISHES what that nav lists.
  showChrome = true,
}: {
  colorScheme: 'light' | 'dark'
  initialLens: Lens
  initialSection: string | null
  showChrome?: boolean
}) {
  const [lens, setLens] = useState<Lens>(initialLens)
  // `?section=` belongs to the lens `?view=` names — it is one link ("open THIS
  // artifact"), and applying it to the library regardless meant the console's link
  // to a sketch selected a component nobody asked for and left the sketch on whichever
  // artifact happened to be first.
  const seed = (of: Lens) => (initialLens === of ? initialSection : null)
  const [libSel, setLibSel] = useState<string | null>(
    seed('library') ?? libraryItems[0]?.key ?? null,
  )
  const [appSel, setAppSel] = useState<string | null>(seed('app') ?? appItems[0]?.key ?? null)
  const [artSel, setArtSel] = useState<string | null>(seed('artifact'))
  const [pickerOpen, setPickerOpen] = useState(false)
  // Whether a design turn is in flight. This shell only sees FILES, so a sketch that
  // has been asked for but not written yet is indistinguishable from an empty
  // workspace — the console polls pi and posts the answer down.
  const [sketching, setSketching] = useState(false)

  // Artifacts are read from disk, not globbed, so a file the design agent writes
  // mid-session appears on the next poll with no reload (see discovery). With a
  // host nav, poll on every lens — the console lists them whichever lens is open,
  // so the list can't wait for this one to be active.
  const {
    artifacts,
    error: artifactError,
    refresh: refreshArtifacts,
  } = useArtifacts(!showChrome || lens === 'artifact')

  // Publish the menu data. Library/App are static Vite globs so they go once;
  // artifacts re-publish as the poll changes.
  useEffect(() => {
    if (showChrome) return
    reportCatalog(catalog())
  }, [showChrome])
  useEffect(() => {
    if (showChrome) return
    reportArtifacts(artifacts.map(({ id, file, name }) => ({ id, file, name })))
  }, [showChrome, artifacts])

  // The host nav drives selection back in. `set-section` carries the lens it
  // belongs to so a click can switch lens and section in one message.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data
      if (data?.source !== 'pikku-console') return
      if (data.type === 'set-lens' && LENSES.some((l) => l.id === data.lens)) {
        setLens(data.lens as Lens)
      } else if (data.type === 'set-sketching') {
        setSketching(!!data.sketching)
      } else if (data.type === 'set-section') {
        const id = typeof data.sectionId === 'string' ? data.sectionId : null
        if (data.lens && LENSES.some((l) => l.id === data.lens)) setLens(data.lens as Lens)
        if (id === null) return
        if (data.lens === 'library') setLibSel(id)
        else if (data.lens === 'app') setAppSel(id)
        else if (data.lens === 'artifact') setArtSel(id)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Follow the list: default to the first artifact, and don't strand the frame on
  // one that has just been deleted.
  useEffect(() => {
    if (artifacts.length === 0) {
      if (artSel !== null) setArtSel(null)
      return
    }
    if (!artSel || !artifacts.some((a) => a.id === artSel)) setArtSel(artifacts[0]!.id)
  }, [artifacts, artSel])

  // Delete a version: confirm, then ask the console to rm the file (it owns the
  // sandbox socket). Its `artifact-deleted` ack just re-reads the directory. One
  // VERSION, never the slug — the older ones are what the user was shown before.
  const onDeleteArtifact = (file: string, name: string) => {
    if (!window.confirm(`Delete this version of "${name}"? This removes artifacts/${file}.`)) {
      return
    }
    requestDeleteArtifact(file)
  }
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.source === 'pikku-console' && e.data?.type === 'artifact-deleted') {
        refreshArtifacts()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refreshArtifacts])

  // ── theme state (read-only: the console owns the editor) ───────────────────
  const consoleThemes = useConsoleThemes()
  const themes = useMemo(() => consoleThemes?.themes ?? [], [consoleThemes?.themes])
  const activeId = consoleThemes?.activeId ?? null

  // Previews render under whichever theme the console says is active.
  const selectedPalette = useMemo(
    () => themes.find((t) => t.id === activeId) ?? themes[0] ?? null,
    [themes, activeId],
  )
  const userTheme: MantineThemeOverride = useMemo(
    () => (selectedPalette ? buildTheme(selectedPalette) : {}),
    [selectedPalette],
  )

  const lensMeta = LENSES.find((l) => l.id === lens)!

  return (
    <Box
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        minHeight: 0,
        background: 'var(--mantine-color-body)',
      }}
    >
      {/* sub-header: lens switch. Geometry is copied from the console's own header
          row (--screen-header-height 45px, --app-panel-bg fill, NO hairline — the
          fill step against the canvas is the seam) so this row, the chat panel's
          tab bar and the project header sit on one baseline across the iframe.
          With a host nav this row IS the console's left panel header, so it is
          not drawn twice. */}
      {showChrome && (
        <div
          style={{
            height: 45,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 12px',
            background: 'var(--app-panel-bg)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--app-text)',
            }}
          >
            <Palette size={15} color="var(--app-accent)" />
            {m.shell_title()}
          </span>
          <ShellToggle
            value={lens}
            onChange={setLens}
            // No chevron here: the canvas header carries the picker affordance, so a
            // second one on the lens switch is redundant.
            items={LENSES.map((l) => ({
              value: l.id,
              label: l.name(),
              icon: <l.icon size={13} />,
              'data-testid': `design-lens-${l.id}`,
            }))}
          />
          <span style={{ fontSize: 12, color: 'var(--app-text-faint)' }}>{lensMeta.blurb()}</span>
        </div>
      )}

      {/* body: left menu + detail. The artifact lens has no menu — it is picked in
          the dialog above, and the page wants the full width. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {showChrome && lens !== 'artifact' && (
          <div
            style={{
              width: 264,
              flexShrink: 0,
              borderRight: '0.5px solid var(--app-border)',
              background: 'var(--app-panel-bg)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
              {lens === 'library' && libraryItems.length === 0 && <NoStories what="component" />}
              {lens === 'library' &&
                groupBy(libraryItems, (i) => i.group).map(([g, items]) => (
                  <div key={g}>
                    <ShellMenuLabel>{g}</ShellMenuLabel>
                    {items.map((it) => (
                      <ShellMenuRow
                        key={it.key}
                        name={it.title}
                        selected={libSel === it.key}
                        onClick={() => setLibSel(it.key)}
                      />
                    ))}
                  </div>
                ))}
              {lens === 'app' && appItems.length === 0 && <NoStories what="widget" />}
              {lens === 'app' &&
                groupBy(appItems, (i) => i.group).map(([g, items]) => (
                  <div key={g}>
                    <ShellMenuLabel>{g}</ShellMenuLabel>
                    {items.map((it) => (
                      <ShellMenuRow
                        key={it.key}
                        name={it.title}
                        selected={appSel === it.key}
                        onClick={() => setAppSel(it.key)}
                      />
                    ))}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* detail */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowY: lens === 'artifact' ? 'hidden' : 'auto',
            padding: lens === 'artifact' ? 0 : '26px 30px',
          }}
        >
          <DetailPanel
            lens={lens}
            libSel={libSel}
            appSel={appSel}
            artifact={artifacts.find((a) => a.id === artSel) ?? artifacts[0]}
            sketching={sketching}
            onNewArtifact={requestDesignAgent}
            onOpenPicker={() => setPickerOpen(true)}
            userTheme={userTheme}
            colorScheme={colorScheme}
          />
        </div>
      </div>

      {pickerOpen && (
        <ArtifactDialog
          artifacts={artifacts}
          selectedId={artSel}
          error={artifactError}
          onSelect={(id) => {
            setArtSel(id)
            setPickerOpen(false)
          }}
          onDelete={onDeleteArtifact}
          onNew={() => {
            setPickerOpen(false)
            requestDesignAgent()
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Box>
  )
}

// The detail panel reuses the existing per-lens views, each rendering the
// selected section's preview under the user theme.
function DetailPanel({
  lens,
  libSel,
  appSel,
  artifact,
  sketching,
  onNewArtifact,
  onOpenPicker,
  userTheme,
  colorScheme,
}: {
  lens: Lens
  libSel: string | null
  appSel: string | null
  artifact: DesignArtifact | undefined
  sketching: boolean
  onNewArtifact: () => void
  onOpenPicker: () => void
  userTheme: MantineThemeOverride
  colorScheme: 'light' | 'dark'
}) {
  if (lens === 'library')
    return <LibraryView section={libSel} previewTheme={userTheme} colorScheme={colorScheme} />
  if (lens === 'app')
    return <AppView section={appSel} previewTheme={userTheme} colorScheme={colorScheme} />
  return (
    <ArtifactView
      artifact={artifact}
      onNew={onNewArtifact}
      onOpenPicker={onOpenPicker}
      sketching={sketching}
      userTheme={userTheme}
      colorScheme={colorScheme}
    />
  )
}

// Library and App are glob-driven: a component only appears once a `*.stories.tsx`
// sits beside it. New apps get those from the `component-kit` scaffold; an app
// built before that landed has the components but not the stories, so say so and
// offer the one action that fixes it. Story files live in the app tree, which the
// design agent may not write — this goes to the BUILD agent.
function NoStories({ what }: { what: 'component' | 'widget' }) {
  return (
    <div style={{ padding: '4px 10px 10px' }}>
      <p
        style={{
          margin: '2px 0 10px',
          fontSize: 11.5,
          lineHeight: 1.45,
          color: 'var(--app-text-faint)',
        }}
      >
        {what === 'widget' ? m.shell_no_widget_stories() : m.shell_no_component_stories()}{' '}
        <code style={{ fontFamily: MONO, fontSize: 10.5 }}>
          {what === 'widget' ? '*.app.stories.tsx' : '*.stories.tsx'}
        </code>{' '}
        {m.shell_no_stories_tail()}
      </p>
      <button
        type="button"
        onClick={requestComponentStories}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          textAlign: 'left',
          padding: '8px 10px',
          borderRadius: 10,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 12.5,
          fontWeight: 600,
          border: '0.5px dashed var(--app-blue-border)',
          background: 'transparent',
          color: 'var(--app-accent)',
        }}
      >
        <Plus size={14} />
        {m.shell_write_stories()}
      </button>
    </div>
  )
}
