import { useEffect, useRef } from 'react'
import { usePanelContextSafe, type PanelType } from '../context/PanelContext'
import { decodePanelHash, panelHashIsBare } from '../lib/panel-url'

export interface PanelUrlOptions<T> {
  type: PanelType
  /**
   * The rows this list can open. Prefer the unfiltered set — a row hidden by
   * the search box is still a row the URL may name.
   */
  items: readonly T[] | undefined
  getId: (item: T) => string
  open: (id: string, item: T) => void
}

/**
 * Makes a list's selection survive a reload, a copied link and a step back into
 * the page: the panel context writes the open row into the URL fragment, and
 * this reopens whatever the fragment names as soon as the row's metadata is in
 * hand.
 *
 * Restoring is the list's job rather than the provider's because a panel renders
 * from the metadata captured when it opened, and only the list that fetched a
 * row holds it. Registering the type is what tells the provider whether this
 * surface can write a bare `#id` or must qualify it as `#type:id`.
 */
export function usePanelUrl<T>({
  type,
  items,
  getId,
  open,
}: PanelUrlOptions<T>): void {
  const panelContext = usePanelContextSafe()
  const registerPanelType = panelContext?.registerPanelType
  const panelHash = panelContext?.panelHash
  const activePanel = panelContext?.activePanel
  const registeredPanelTypes = panelContext?.registeredPanelTypes

  // Read through refs so a list that rebuilds its callbacks each render does not
  // re-run the restore, and so the effect below depends on the data alone.
  const getIdRef = useRef(getId)
  getIdRef.current = getId
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => registerPanelType?.(type), [registerPanelType, type])

  useEffect(() => {
    if (!panelHash || !items?.length || !registeredPanelTypes) return
    const target = decodePanelHash(panelHash)
    if (!target) return
    if (
      target.type
        ? target.type !== type
        : !panelHashIsBare(registeredPanelTypes)
    ) {
      return
    }
    if (activePanel === `${type}-${target.id}`) return
    const item = items.find((row) => getIdRef.current(row) === target.id)
    if (item) openRef.current(target.id, item)
  }, [panelHash, items, type, activePanel, registeredPanelTypes])
}
