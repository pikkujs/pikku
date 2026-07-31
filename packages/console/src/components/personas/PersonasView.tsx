import React from 'react'
import { Stack, Skeleton } from '@pikku/mantine/core'
import { UserRound } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { PersonaCard } from './PersonaCard'
import { usePanelContext } from '../../context/PanelContext'
import type { PersonaEntry } from './persona-types'

type PersonasViewProps = {
  personas: PersonaEntry[]
  loading?: boolean
  onOpenScenario?: (name: string) => void
}

export const PersonasView: React.FC<PersonasViewProps> = ({
  personas,
  loading = false,
  onOpenScenario,
}) => {
  useLocale()
  const { openPersona } = usePanelContext()

  if (loading) {
    return (
      <Stack gap={12} p="md">
        <Skeleton height={92} radius={14} />
        <Skeleton height={92} radius={14} />
      </Stack>
    )
  }

  if (personas.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={UserRound}
        title={m.personas_empty_title()}
        description={m.personas_empty_description()}
        docsHref="https://pikku.dev/docs/wiring/workflows"
      />
    )
  }

  return (
    <Stack gap={12}>
      {personas.map((p) => (
        <PersonaCard
          key={p.key}
          persona={p}
          onOpen={(key) => {
            const persona = personas.find((entry) => entry.key === key)
            if (persona) {
              openPersona(key, persona.name, { persona, onOpenScenario })
            }
          }}
        />
      ))}
    </Stack>
  )
}
