import React from 'react'
import { Skeleton, Stack, Text } from '@pikku/mantine/core'
import { UserRound } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { PersonaRow } from './PersonaRow'
import { usePanelContext } from '../../context/PanelContext'
import type { PersonaEntry } from './persona-types'
import classes from './personas.module.css'

const PERSONAS_DOCS = 'https://pikku.dev/docs/wiring/personas'

type PersonasViewProps = {
  personas: PersonaEntry[]
  loading?: boolean
  onOpenScenario?: (name: string) => void
  onOpenVirtualUser?: (key: string) => void
  /**
   * What the caller is filtering by, when it is filtering. An empty list means
   * two different things — this project declares nobody, or this search matched
   * nobody — and telling someone with forty personas to go and declare one is a
   * lie about their own codebase.
   */
  query?: string
}

export const PersonasView: React.FC<PersonasViewProps> = ({
  personas,
  loading = false,
  onOpenScenario,
  onOpenVirtualUser,
  query,
}) => {
  useLocale()
  const { openPersona } = usePanelContext()

  if (loading) {
    return (
      <Stack gap={8} p="md">
        <Skeleton height={62} radius={10} />
        <Skeleton height={62} radius={10} />
        <Skeleton height={62} radius={10} />
      </Stack>
    )
  }

  if (personas.length === 0) {
    return query ? (
      <Text size="sm" c="dimmed" p="md" data-testid="personas-no-matches">
        {m.personas_no_matches({ query })}
      </Text>
    ) : (
      <EmptyStatePlaceholder
        icon={UserRound}
        title={m.personas_empty_title()}
        description={m.personas_empty_description()}
        docsHref={PERSONAS_DOCS}
      />
    )
  }

  return (
    <Stack gap={8} className={classes.list}>
      {personas.map((persona) => (
        <PersonaRow
          key={persona.key}
          persona={persona}
          onOpen={(key) =>
            openPersona(key, persona.name, {
              persona,
              onOpenScenario,
              onOpenVirtualUser,
            })
          }
        />
      ))}
    </Stack>
  )
}
