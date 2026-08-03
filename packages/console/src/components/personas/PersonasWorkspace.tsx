import React, { useMemo, useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { PersonasView } from './PersonasView'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'
import { useNavigate } from '../../router'

const PERSONAS_DOCS = 'https://pikku.dev/docs/wiring/personas'

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
  const [searchQuery, setSearchQuery] = useState('')
  const query = searchQuery.trim()

  const filtered = useMemo(() => {
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
  }, [personas, query])

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={m.nav_personas()}
          description={
            query
              ? m.personas_showing({
                  shown: filtered.length,
                  total: personas.length,
                })
              : m.personas_page_description()
          }
          docsHref={PERSONAS_DOCS}
          search={{
            placeholder: m.personas_search_placeholder(),
            value: searchQuery,
            onChange: setSearchQuery,
            width: 240,
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
        loading={loading}
        query={query || undefined}
        onOpenVirtualUser={(key) =>
          navigate(`/virtual-users?persona=${encodeURIComponent(key)}`)
        }
      />
    </ResizablePanelLayout>
  )
}
