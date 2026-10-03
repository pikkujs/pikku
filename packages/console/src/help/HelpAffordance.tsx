import { lazy, Suspense, useState } from 'react'
import { ActionIcon, Tooltip } from '@pikku/mantine/core'
import { CircleQuestionMark } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useOptionalConsoleRouter, type ConsoleRouter } from '../router'
import { resolveHelpScreen, type HelpScreen } from './screens'

const HelpPanel = lazy(() =>
  import('./HelpPanel').then((mod) => ({ default: mod.HelpPanel }))
)

function HelpButton({ screen }: { screen: HelpScreen }) {
  const [open, setOpen] = useState(false)
  useLocale()
  return (
    <>
      <Tooltip label={m.help_open()}>
        <ActionIcon
          variant="default"
          color="gray"
          size="input-sm"
          aria-label={m.help_open()}
          onClick={() => setOpen((o) => !o)}
          data-testid="help-open"
        >
          <CircleQuestionMark size={16} />
        </ActionIcon>
      </Tooltip>
      {open && (
        <Suspense fallback={null}>
          <HelpPanel screen={screen} opened onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}

function HelpForRoute({ router }: { router: ConsoleRouter }) {
  const screen = resolveHelpScreen(router.useLocation().pathname)
  if (!screen) return null
  return <HelpButton screen={screen} />
}

/**
 * The `?` for the current screen, and the panel it opens.
 *
 * Every screen gets one without opting in: the screen is resolved from the route,
 * so a page passes nothing. A route with no entry renders nothing — a `?` that
 * opens an empty panel is worse than no `?` — and `screens.test.ts` is what stops
 * that staying quiet.
 */
export function HelpAffordance() {
  const router = useOptionalConsoleRouter()
  if (!router) return null
  return <HelpForRoute router={router} />
}
