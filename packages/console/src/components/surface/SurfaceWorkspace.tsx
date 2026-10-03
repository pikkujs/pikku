import React, { useMemo, useState } from 'react'
import { Box } from '@pikku/mantine/core'
import { DoorOpen } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { usePageOptionsDismiss } from '../../context/PageOptionsProvider'
import { usePanelContext } from '../../context/PanelContext'
import { SurfaceNavigator } from './SurfaceNavigator'
import { ENTRY_POINT_LABEL } from './surface-copy'
import { SurfaceLeafDocument } from './SurfaceLeafDocument'
import { stepsOf } from './surface-steps'
import type { SurfaceDoc, SurfaceUsage } from './surface.types'
import classes from '../ui/console.module.css'

const DOCS_HREF = 'https://pikku.dev/docs/api'

export interface SurfaceWorkspaceProps {
  doc?: SurfaceDoc
  /** The console has it and the website does not; every affordance reading it
   *  is optional, so the same page teaches without it and confirms with it. */
  usage?: SurfaceUsage
  loading?: boolean
}

/**
 * The public surface as documentation: the doors and their leaves on the start
 * edge, one door's exports in the middle, and whichever export you clicked on
 * the end edge.
 */
export const SurfaceWorkspace: React.FC<SurfaceWorkspaceProps> = ({
  doc,
  usage,
  loading,
}) => {
  useLocale()
  const dismiss = usePageOptionsDismiss()
  const { activePanel, closePanel } = usePanelContext()
  const [entryPointId, setEntryPointId] = useState<string | null>(null)
  const [specifier, setSpecifier] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const entryPoint = useMemo(() => {
    if (!doc?.entryPoints.length) return undefined
    return (
      doc.entryPoints.find((each) => each.id === entryPointId) ??
      doc.entryPoints[0]
    )
  }, [doc, entryPointId])

  // The first leaf of the first step is where the story starts, so an untouched
  // page is already reading rather than asking to be clicked.
  const leaf = useMemo(() => {
    if (!entryPoint) return undefined
    const leaves = stepsOf(entryPoint).flatMap((group) => group.leaves)
    return leaves.find((each) => each.specifier === specifier) ?? leaves[0]
  }, [entryPoint, specifier])

  // An open export belongs to the door you were reading; walking to another one
  // leaves it behind rather than stranding it beside a list it is not in.
  const leave = () => {
    dismiss()
    if (activePanel) closePanel(activePanel)
  }

  // Which door you came through reframes every leaf and every export below it,
  // so it belongs beside the title rather than at the top of the leaf list —
  // and the header's measured collapse folds it to a cycle button on narrow
  // widths, which a segmented control in the sidebar never did.
  const selectEntryPoint = (id: string) => {
    setEntryPointId(id)
    setSpecifier(null)
    leave()
  }

  const header = (
    <ListPageHeader
      title={m.surface_title()}
      description={m.surface_description()}
      docsHref={DOCS_HREF}
      selection={
        doc && entryPoint && doc.entryPoints.length > 1
          ? {
              ariaLabel: m.surface_entry_point_label(),
              value: entryPoint.id,
              onChange: selectEntryPoint,
              options: doc.entryPoints.map((each) => ({
                value: each.id,
                label: ENTRY_POINT_LABEL[each.id](),
                'data-testid': `surface-entry-${each.id}`,
              })),
            }
          : undefined
      }
      search={{
        placeholder: m.surface_search_placeholder(),
        value: search,
        onChange: setSearch,
      }}
    />
  )

  if (!loading && (!doc || !entryPoint || !leaf)) {
    return (
      <ResizablePanelLayout header={header} hidePanel>
        <EmptyStatePlaceholder
          icon={DoorOpen}
          title={m.surface_empty_title()}
          description={m.surface_empty_description()}
          docsHref={DOCS_HREF}
        />
      </ResizablePanelLayout>
    )
  }

  return (
    <ResizablePanelLayout
      header={header}
      emptyPanelMessage={m.surface_select_item()}
      leftDrawer={
        doc && entryPoint ? (
          <Box className={classes.listSurfaceCard} style={{ height: '100%' }}>
            <SurfaceNavigator
              entryPoint={entryPoint}
              selectedSpecifier={leaf?.specifier ?? null}
              onSelectLeaf={(next) => {
                setSpecifier(next)
                leave()
              }}
            />
          </Box>
        ) : null
      }
    >
      {leaf && (
        <SurfaceLeafDocument
          leaf={leaf}
          usage={usage?.bySpecifier[leaf.specifier]}
          searchQuery={search}
        />
      )}
    </ResizablePanelLayout>
  )
}
