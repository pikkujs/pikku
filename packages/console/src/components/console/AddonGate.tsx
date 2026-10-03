import type { ReactNode } from 'react'
import { PlugZap } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { useAddonEnabled, type ConsoleAddon } from '../../hooks/useAddonEnabled'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const WIRING: Record<ConsoleAddon, string> = {
  console: "wireAddon({ name: 'console', package: '@pikku/addon-console' })",
  admin: "wireAddon({ name: 'admin', package: '@pikku/addon-admin' })",
}

const DOCS: Record<ConsoleAddon, string> = {
  console: 'https://pikku.dev/docs/console',
  admin: 'https://pikku.dev/docs/console',
}

/**
 * Renders a screen only once the addon that serves it is wired, and explains
 * the gap rather than hiding the screen when it is not.
 *
 * Hiding was the alternative and it is the worse one: the navigation is the
 * map of what the console can do, and a deployment that has not wired an addon
 * should learn that it exists and how to turn it on — not find a shorter menu
 * than the one in the docs.
 */
export const AddonGate: React.FC<{
  addon: ConsoleAddon
  children: ReactNode
}> = ({ addon, children }) => {
  const state = useAddonEnabled(addon)
  useLocale()

  if (state === 'checking') {
    return <ConsoleLoading />
  }

  if (state === 'not-wired') {
    return (
      <EmptyState
        icon={PlugZap}
        title={
          addon === 'admin'
            ? m.addon_gate_admin_title()
            : m.addon_gate_console_title()
        }
        subtitle={
          addon === 'admin'
            ? m.addon_gate_admin_subtitle()
            : m.addon_gate_console_subtitle()
        }
        code={WIRING[addon]}
        secondaryAction={{
          label: m.addon_gate_docs(),
          href: DOCS[addon],
        }}
      />
    )
  }

  return <>{children}</>
}
