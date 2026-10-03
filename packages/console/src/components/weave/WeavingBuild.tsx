import { useMemo } from 'react'
import { PanelProvider } from '../../context/PanelContext'
import { ConsoleEditableProvider } from '../../context/ConsoleEditableContext'
import { useLocale } from '@/i18n/config'
import type { WeavingBuildProps } from './types'

import { useWeaveMeta } from './useWeaveMeta'
import { usePageWeavePieces } from './usePageWeavePieces'
import { usePageOpener } from './usePageOpener'
import { useAddonWeavePieces } from './useAddonWeavePieces'

import { useJustWoven } from './useJustWoven'

import { WeavingBuildBody } from './WeavingBuildBody'

/**
 * The view shown in the builder in place of the app while it's still being
 * built. Drives entirely off the live pikku meta from the dev console.
 */
export function WeavingBuild({
  title,
  showFilters = true,
  onOpenApp,
  building = true,
}: WeavingBuildProps) {
  useLocale()
  const { pieces: metaPieces, loading } = useWeaveMeta()
  const pagePieces = usePageWeavePieces()
  const addonPieces = useAddonWeavePieces()
  const pieces = useMemo(
    () => [...metaPieces, ...pagePieces, ...addonPieces],
    [metaPieces, pagePieces, addonPieces],
  )
  const hot = useJustWoven(pieces)
  const openPage = usePageOpener()

  return (
    <ConsoleEditableProvider editable={false}>
      <PanelProvider>
        <WeavingBuildBody
          pieces={pieces}
          loading={loading}
          hot={hot}
          title={title}
          showFilters={showFilters}
          onOpenApp={onOpenApp}
          building={building}
          openPage={openPage}
        />
      </PanelProvider>
    </ConsoleEditableProvider>
  )
}
