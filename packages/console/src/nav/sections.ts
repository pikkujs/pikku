import type React from 'react'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import {
  Activity,
  Bot,
  BookOpen,
  Boxes,
  Braces,
  Clock,
  DoorOpen,
  Database,
  FlaskConical,
  FunctionSquare,
  GitBranch,
  GitCompare,
  Globe,
  KeyRound,
  ListOrdered,
  Lock,
  Mail,
  Package,
  Radio,
  Route,
  ScrollText,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  Cpu,
  Gauge,
  Network,
  UserRound,
  UserSearch,
  Users,
  UserCog,
  Variable,
  Webhook,
  Zap,
} from 'lucide-react'

export type NavIcon = React.ComponentType<{ size?: number; color?: string }>

export interface NavItem {
  /** A string rather than a node: the dock reads a nav label into a tooltip, a
   *  tile's `aria-label` and a flyout row's composed one, and an element cannot
   *  be any of those. */
  label: I18nString
  href: string
  icon: NavIcon
  matchPrefix: string
}

/**
 * A titled run of items inside a section.
 *
 * The title is the QUESTION the run answers — "who is in it", "what runs by
 * itself" — not a restatement of the rows under it. A long flyout with no
 * headings is a list you have to read; the same list under three questions is
 * one you can skip through, and the question is what tells you whether the row
 * you want is in this section at all.
 */
export interface NavGroup {
  id: string
  title?: I18nString
  items: NavItem[]
}

export interface NavSection {
  /** Stable, untranslated key: it survives a locale change and gives a section
   *  an identity declared in code rather than rendered to the user. */
  id: string
  /** Absent on the row zone, whose items are tiles of their own and so have no
   *  group to hang a label off. */
  title?: I18nString
  /** The section's own glyph, for surfaces that draw a section rather than list
   *  it — the dock collapses each section to one tile. */
  icon?: NavIcon
  /**
   * Where the dock puts the section: `row` spreads its items along the dock as
   * tiles of their own, `group` collapses them behind one tile whose flyout
   * lists them under their group titles.
   */
  zone?: 'row' | 'group'
  groups: NavGroup[]
}

/** Every item in a section, in reading order — for the surfaces that want the
 *  rows without the questions above them. */
export const navItems = (section: NavSection): NavItem[] =>
  section.groups.flatMap((group) => group.items)

const item = (label: I18nString, href: string, icon: NavIcon): NavItem => ({
  label,
  href,
  icon,
  matchPrefix: href,
})

/**
 * What the console contains, arranged by the question you are asking rather
 * than by the console's own internals.
 *
 * The sections used to be named Wiring, Project and Access — three names for
 * "the rest of it", which meant that finding a screen depended on knowing which
 * catch-all its implementation happened to fall into. Each group below asks one
 * question instead — who is in it, what is in it, what it does on its own, what
 * is tested, how it is run, how it is built — and the runs inside a group ask a
 * narrower one. It is the arrangement fabric's dock already uses, and the two
 * being the same row is the point.
 */
export function consoleNavSections(): NavSection[] {
  return [
    {
      id: 'main',
      zone: 'row',
      groups: [
        {
          id: 'main',
          items: [
            item(m.nav_overview(), '/overview', Gauge),
            item(m.nav_functions(), '/functions', FunctionSquare),
            item(m.nav_workflows(), '/workflow', GitBranch),
          ],
        },
      ],
    },
    {
      id: 'people',
      title: m.nav_people(),
      icon: Users,
      groups: [
        {
          id: 'members',
          title: m.nav_group_who_is_in_it(),
          items: [item(m.nav_users(), '/users', Users)],
        },
        {
          id: 'access',
          title: m.nav_group_what_they_may_do(),
          items: [
            item(m.nav_roles(), '/roles', UserCog),
            item(m.nav_scopes(), '/scopes', Shield),
            item(m.nav_credentials(), '/credentials', KeyRound),
            item(m.nav_audit(), '/audit', ScrollText),
          ],
        },
      ],
    },
    {
      id: 'content',
      title: m.nav_content(),
      icon: Boxes,
      groups: [
        {
          id: 'data',
          title: m.nav_group_data(),
          items: [item(m.nav_database(), '/database', Database)],
        },
        {
          id: 'copy',
          title: m.nav_group_copy(),
          items: [item(m.nav_emails(), '/emails', Mail)],
        },
        {
          id: 'reference',
          title: m.nav_group_reference(),
          items: [item(m.nav_knowledge(), '/knowledge', BookOpen)],
        },
      ],
    },
    {
      id: 'ai',
      title: m.nav_ai(),
      icon: Sparkles,
      groups: [
        {
          id: 'doing',
          title: m.nav_group_doing_the_work(),
          items: [item(m.nav_agents(), '/agents', Bot)],
        },
        {
          id: 'checking',
          title: m.nav_group_checking_the_work(),
          items: [
            item(m.nav_scorers(), '/scorers', Target),
            item(m.nav_virtual_users(), '/virtual-users', UserSearch),
          ],
        },
      ],
    },
    {
      id: 'testing',
      title: m.nav_testing(),
      icon: FlaskConical,
      groups: [
        {
          id: 'what',
          title: m.nav_group_what_is_tested(),
          items: [item(m.nav_scenarios(), '/scenarios', Route)],
        },
        {
          id: 'who',
          title: m.nav_group_who_tests_it(),
          items: [item(m.nav_personas(), '/personas', UserRound)],
        },
      ],
    },
    {
      id: 'operate',
      title: m.nav_operate(),
      icon: Activity,
      groups: [
        {
          // OAuth is configuration rather than access: it declares how sign-in
          // is set up and reads secrets to do it. Everything under People is
          // live state.
          id: 'configuration',
          title: m.nav_group_configuration(),
          items: [
            item(m.nav_env_vars(), '/variables', Variable),
            item(m.nav_secrets(), '/secrets', KeyRound),
            item(m.nav_oauth(), '/auth-providers', Lock),
            item(m.nav_security(), '/security', ShieldCheck),
          ],
        },
        {
          id: 'connections',
          title: m.nav_group_connections(),
          items: [
            item(m.nav_webhooks(), '/webhooks', Webhook),
            item(m.nav_addons(), '/addons', Package),
          ],
        },
        {
          id: 'changed',
          title: m.nav_group_what_changed(),
          items: [item(m.nav_changes(), '/changes', GitCompare)],
        },
      ],
    },
    {
      id: 'build',
      title: m.nav_build(),
      icon: Braces,
      groups: [
        {
          id: 'wiring',
          title: m.nav_group_wiring(),
          items: [
            item(m.nav_http(), '/wires/http', Globe),
            item(m.nav_channels(), '/wires/channel', Radio),
            item(m.nav_mcp(), '/wires/mcp', Cpu),
            item(m.nav_cli(), '/wires/cli', Terminal),
            item(m.nav_gateways(), '/wires/gateway', Network),
          ],
        },
        {
          id: 'async',
          title: m.nav_group_runs_by_itself(),
          items: [
            item(m.nav_schedulers(), '/async/scheduler', Clock),
            item(m.nav_queues(), '/async/queue', ListOrdered),
            item(m.nav_triggers(), '/async/trigger', Zap),
          ],
        },
        {
          id: 'runs',
          title: m.nav_group_where_it_runs(),
          items: [
            item(m.nav_runtime(), '/runtime', Server),
            item(m.nav_surface(), '/surface', DoorOpen),
          ],
        },
      ],
    },
  ]
}

/** {@link consoleNavSections}, re-read whenever the locale changes so the
 *  labels follow it. */
export function useDefaultNavSections(): NavSection[] {
  useLocale()
  return consoleNavSections()
}
