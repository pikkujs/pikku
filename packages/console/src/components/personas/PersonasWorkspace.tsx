import React, { useMemo, useState } from 'react'
import {
  Divider,
  SimpleGrid,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { Plug, UsersRound } from 'lucide-react'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { ForDevelopers } from '../ui/ForDevelopers'
import {
  DevField,
  DevFields,
  DevMono,
  DevNote,
  DevTable,
  devSourcePath,
} from '../ui/DevDetail'
import { PersonasView } from './PersonasView'
import {
  useScenarioPersonaEntries,
  useScenarioSubjectEntries,
} from '../../hooks/useScenarioEntries'
import { useNavigate } from '../../router'
import type { PersonaEntry } from './persona-types'

const PERSONAS_DOCS = 'https://pikku.dev/docs/wiring/personas'

type ActorFilter = 'all' | 'people' | 'system'

const Fact: React.FC<{ label: I18nNode; value: I18nNode }> = ({
  label,
  value,
}) => (
  <Stack gap={4}>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Text size="sm" fw={500}>
      {value}
    </Text>
  </Stack>
)

const PersonasSummary: React.FC<{
  personas: PersonaEntry[]
  systems: number
}> = ({ personas, systems }) => {
  const roles = new Set(
    personas.flatMap((persona) => persona.roles.map((role) => role.name))
  ).size
  const cast = personas.filter((persona) => persona.scenarios.length > 0).length
  const runnable = personas.filter((persona) => persona.runnable).length
  const total = personas.length

  return (
    <SectionCard
      testId="personas-summary"
      hero
      title={
        total === 1
          ? m.personas_hero_title_one()
          : m.personas_hero_title({ count: total })
      }
      blurb={m.personas_hero_body()}
    >
      <Divider my="md" />
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
        <Fact label={m.personas_fact_roles()} value={asI18n(String(roles))} />
        <Fact
          label={m.personas_fact_cast()}
          value={m.personas_fact_of({ done: cast, total })}
        />
        <Fact
          label={m.personas_fact_signin()}
          value={m.personas_fact_of({ done: runnable, total })}
        />
        <Fact
          label={m.personas_fact_systems()}
          value={asI18n(String(systems))}
        />
      </SimpleGrid>
    </SectionCard>
  )
}

const PersonasDeveloperDetail: React.FC<{ personas: PersonaEntry[] }> = ({
  personas,
}) => {
  const files = [
    ...new Set(
      personas
        .map((persona) => persona.sourceFile)
        .filter((file): file is string => Boolean(file))
    ),
  ]

  return (
    <ForDevelopers
      attached
      label={m.personas_dev_label()}
      hint={m.personas_dev_hint()}
      testId="personas-developers"
    >
      <DevNote>{m.personas_defined_in()}</DevNote>
      <DevFields>
        {files.map((file) => (
          <DevField key={file} label={m.dev_source()} value={devSourcePath(file)} />
        ))}
      </DevFields>
      <DevTable
        columns={[
          m.personas_dev_col_key(),
          m.personas_dev_col_login(),
          m.personas_dev_col_behaviour(),
          m.personas_dev_col_scopes(),
        ]}
        rows={personas.map((persona) => ({
          key: persona.key,
          cells: [
            <DevMono key="key" value={persona.key} copy />,
            <DevMono key="login" value={persona.email} copy />,
            <Text key="behaviour" size="sm">
              {asI18n(persona.disposition || '—')}
            </Text>,
            persona.scopes.length === 0 ? (
              <Text key="scopes" size="sm" c="dimmed">
                {m.personas_no_scopes()}
              </Text>
            ) : (
              <DevMono key="scopes" value={persona.scopes.join(', ')} />
            ),
          ],
        }))}
      />
    </ForDevelopers>
  )
}

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
  const openVirtualUser = (key: string) =>
    navigate(`/virtual-users?persona=${encodeURIComponent(key)}`)

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
      surface="cards"
    >
      <CardsPage>
        {!loading && !query && personas.length > 0 && (
          <PersonasSummary personas={personas} systems={subjects.length} />
        )}
        {actorFilter !== 'system' && (
          <SectionCard
            testId="personas-people"
            title={m.personas_people_title()}
            subtitle={
              loading
                ? undefined
                : filtered.length === 1
                  ? m.personas_people_count_one()
                  : m.personas_people_count({ count: filtered.length })
            }
            blurb={m.personas_people_blurb()}
            footer={
              !loading && filtered.length > 0 ? (
                <PersonasDeveloperDetail personas={filtered} />
              ) : undefined
            }
          >
            <Stack gap="md" mt="md">
              <PersonasView
                personas={filtered}
                loading={loading}
                query={query || undefined}
                onOpenVirtualUser={openVirtualUser}
              />
            </Stack>
          </SectionCard>
        )}
        {actorFilter !== 'people' && (
          <SectionCard
            testId="personas-systems"
            title={m.personas_systems_title()}
            blurb={m.personas_systems_blurb()}
          >
            <Stack gap="xs" mt="md">
              {filteredSubjects.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {query
                    ? m.personas_no_matches({ query })
                    : m.personas_systems_none()}
                </Text>
              ) : (
                <PersonasView personas={[]} subjects={filteredSubjects} />
              )}
            </Stack>
          </SectionCard>
        )}
      </CardsPage>
    </ResizablePanelLayout>
  )
}
