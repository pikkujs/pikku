import React, { useMemo, useState } from 'react'
import { Plug, UsersRound } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { PersonasView } from './PersonasView'
import {
  useScenarioPersonaEntries,
  useScenarioSubjectEntries,
} from '../../hooks/useScenarioEntries'
import { useNavigate } from '../../router'

const PERSONAS_DOCS = 'https://pikku.dev/docs/wiring/personas'

/**
 * Which actors the list shows. `people` is the default because it is the
 * question the page is usually asked — the platform and the addons act, but
 * they hold no roles and sign in as nobody, so leading with them would put the
 * two rows nothing is authorized through above the forty that are.
 */
type ActorFilter = 'all' | 'people' | 'system'

/**
 * The people this product is declared to be for.
 *
 * A page of its own rather than a panel hanging off the scenarios screen: the
 * same declaration now feeds scenarios, virtual users and the knowledge base,
 * so filing it under any one of them makes the other two look like they invented
 * their own cast.
 */
export const PersonasWorkspace: React.FC = () => {
  useLocale()
  const navigate = useNavigate()
  const { personas, loading } = useScenarioPersonaEntries()
  const { subjects } = useScenarioSubjectEntries()
  const [searchQuery, setSearchQuery] = useState('')
  const [actorFilter, setActorFilter] = useState<ActorFilter>('people')
  const query = searchQuery.trim()

  const filtered = useMemo(() => {
    if (actorFilter === 'system') return []
    const q = query.toLowerCase()
    if (!q) return personas
    return personas.filter(
      (p) =>
        p.key.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.jobTitle?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.personality?.toLowerCase().includes(q) ||
        p.disposition?.toLowerCase().includes(q) ||
        p.roles.some((role) => role.name.toLowerCase().includes(q)) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  }, [personas, query, actorFilter])

  // A subject matches on its own name and on the steps it declares, which is
  // the only vocabulary it has — there is no job title or personality to search.
  const filteredSubjects = useMemo(() => {
    if (actorFilter === 'people') return []
    const q = query.toLowerCase()
    if (!q) return subjects
    return subjects.filter(
      (s) =>
        s.key.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.steps.some((step) => step.displayName.toLowerCase().includes(q))
    )
  }, [subjects, query, actorFilter])

  const shown = filtered.length + filteredSubjects.length
  const total =
    actorFilter === 'people'
      ? personas.length
      : actorFilter === 'system'
        ? subjects.length
        : personas.length + subjects.length

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader<ActorFilter>
          title={m.nav_personas()}
          description={
            query
              ? m.personas_showing({ shown, total })
              : m.personas_page_description()
          }
          docsHref={PERSONAS_DOCS}
          search={{
            placeholder: m.personas_search_placeholder(),
            value: searchQuery,
            onChange: setSearchQuery,
            width: 240,
          }}
          selection={{
            ariaLabel: m.personas_filter_label(),
            value: actorFilter,
            onChange: setActorFilter,
            options: [
              {
                value: 'people',
                label: m.personas_filter_people(),
                icon: <UsersRound size={13} />,
                'data-testid': 'personas-filter-people',
              },
              {
                value: 'system',
                label: m.personas_filter_system(),
                icon: <Plug size={13} />,
                'data-testid': 'personas-filter-system',
              },
              {
                value: 'all',
                label: m.personas_filter_all(),
                'data-testid': 'personas-filter-all',
              },
            ],
          }}
        />
      }
      emptyPanelMessage={m.personas_select_persona()}
    >
      {/* No `onOpenScenario`: the scenarios page deep-links by feature id, not
          by scenario name, so a link from here would land on the wrong feature.
          The cast list stays readable, and following one is a job for the
          scenarios page's own rail. */}
      <PersonasView
        personas={filtered}
        subjects={filteredSubjects}
        loading={loading}
        query={query || undefined}
        onOpenVirtualUser={(key) =>
          navigate(`/virtual-users?persona=${encodeURIComponent(key)}`)
        }
      />
    </ResizablePanelLayout>
  )
}
