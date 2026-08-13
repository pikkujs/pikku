import type { ReactNode } from 'react'
import { PanelProvider } from '../../context/PanelContext'
import { HostConsoleChrome } from '../../context/ConsoleChromeContext'
import { PanelCard } from '../layout/PageLayout'

/**
 * A console screen as the shell renders it: one page card, with the screen's
 * selection opening in the end-edge panel beside it.
 *
 * The screen itself renders flush — `HostConsoleChrome` tells it that the card
 * around it is already drawn, which is what stops a card inside a card and
 * switches its layout from a docked details column to the end-edge panel.
 */
export function ConsoleScreen({ children }: { children: ReactNode }) {
  return (
    <ConsolePanelHost>
      <ConsoleScreenCard>{children}</ConsoleScreenCard>
    </ConsolePanelHost>
  )
}

/**
 * The panel context every list and inspector reads from, without the card.
 *
 * The panel it opens into is NOT mounted here — see {@link ConsoleDetailPanel}
 * for why the layout inside the screen mounts it instead.
 */
export function ConsolePanelHost({ children }: { children: ReactNode }) {
  return <PanelProvider>{children}</PanelProvider>
}

/** The page card, with the screen inside told not to draw chrome of its own. */
export function ConsoleScreenCard({ children }: { children: ReactNode }) {
  return (
    <PanelCard>
      <HostConsoleChrome>{children}</HostConsoleChrome>
    </PanelCard>
  )
}
